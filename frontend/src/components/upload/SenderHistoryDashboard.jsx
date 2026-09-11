import React, { useState, useEffect } from 'react';
import {
  Clock, Key, Copy, Trash2, CheckCircle2,
  Flame, HardDrive, Eye
} from 'lucide-react';
import { formatBytes } from '../../utils/format';
import { copyToClipboard } from '../../utils/clipboard';
import { api } from '../../services/api';
import { getSenderHistory, removeTransferFromHistory, updateTransferInHistory, clearAllTransferHistory } from '../../services/transferHistory';

/**
 * SenderHistoryDashboard Component
 * Primary Responsibility: Display sender's transfer hub, monitoring active countdown timers
 * and providing quick code copy, QR display, and cancellation controls.
 * Note: Users never see download counts, download history, or internal transfer statistics.
 */
export function SenderHistoryDashboard({ onSelectTransferForQR, activeTransferId }) {
  const [history, setHistory] = useState([]);
  const [copiedId, setCopiedId] = useState(null);
  const [cancellingId, setCancellingId] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [userStorage, setUserStorage] = useState(null);
  const [isClearingStorage, setIsClearingStorage] = useState(false);
  const [storageMessage, setStorageMessage] = useState(null);

  const reloadHistory = () => {
    setHistory(getSenderHistory());
  };

  const fetchStorage = async () => {
    try {
      const data = await api.getUserStorage();
      setUserStorage(data);
    } catch (_) {}
  };

  useEffect(() => {
    reloadHistory();
    fetchStorage();
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleCopyCode = async (code, fileId) => {
    if (!code) return;
    const ok = await copyToClipboard(code);
    if (ok) {
      setCopiedId(fileId);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const handleCancelTransfer = async (item) => {
    if (!item?.fileId) return;
    const confirmCancel = window.confirm(`Are you sure you want to permanently cancel and delete "${item.fileName}" from the server?`);
    if (!confirmCancel) return;

    setCancellingId(item.fileId);
    try {
      const ownerToken = item.ownerToken || sessionStorage.getItem(`fs_owner_${item.fileId}`);
      if (ownerToken) {
        await api.cancel(item.fileId, ownerToken);
      }
      updateTransferInHistory(item.fileId, { status: 'cancelled' });
      reloadHistory();
      await fetchStorage();
    } catch (err) {
      console.warn('Could not cancel server transfer:', err);
      updateTransferInHistory(item.fileId, { status: 'cancelled' });
      reloadHistory();
    } finally {
      setCancellingId(null);
    }
  };

  const handleClearStorage = async () => {
    const usedMb = userStorage?.used_mb || 0;
    const confirmClear = window.confirm(
      `Clear your 1 GB personal storage (${usedMb} MB currently used)?\n\nThis will permanently delete all your active uploaded files from the server and instantly reset your quota to 0 MB / 1024 MB.`
    );
    if (!confirmClear) return;

    setIsClearingStorage(true);
    setStorageMessage(null);
    try {
      const res = await api.clearUserStorage();
      clearAllTransferHistory();
      reloadHistory();
      await fetchStorage();
      setStorageMessage(`Storage wiped! Freed ${res.freed_mb ?? usedMb} MB. Quota reset to 0 MB.`);
      setTimeout(() => setStorageMessage(null), 4000);
    } catch (err) {
      alert(err.message || 'Could not clear storage');
    } finally {
      setIsClearingStorage(false);
    }
  };

  const handleRemoveRecord = (fileId) => {
    removeTransferFromHistory(fileId);
    reloadHistory();
  };

  if (history.length === 0 && (!userStorage || userStorage.used_bytes === 0)) {
    return null;
  }

  const formatRemainingTime = (expiresAt) => {
    if (!expiresAt) return 'No expiry set';
    const diff = new Date(expiresAt).getTime() - now;
    if (diff <= 0) return 'Expired';
    const totalSecs = Math.floor(diff / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}m ${secs < 10 ? '0' : ''}${secs}s remaining`;
  };

  const usedMb = userStorage ? userStorage.used_mb : 0;
  const maxMb = userStorage ? userStorage.max_mb : 1024;
  const usedPercent = userStorage ? userStorage.used_percentage : 0;

  return (
    <div className="sender-history-section animate-in" aria-label="Active Transfers Dashboard">
      <div className="sender-history-header">
        <div className="sender-history-title-group">
          <HardDrive size={18} className="sender-history-icon" />
          <h3 className="sender-history-title">My Shared Transfers</h3>
          <span className="badge badge-primary">{history.length}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            className="btn btn-secondary btn-xs"
            onClick={handleClearStorage}
            disabled={isClearingStorage || usedMb === 0}
            title="Wipe your 1 GB personal storage and delete all your active uploads"
            style={{ color: 'var(--danger-fg, #ef4444)', borderColor: 'var(--border-default)' }}
          >
            <Trash2 size={12} className="mr-1" />
            <span>{isClearingStorage ? 'Wiping...' : `Clear My Storage (${usedMb} MB / ${maxMb} MB)`}</span>
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            onClick={() => {
              if (window.confirm('Clear all transfer history records from this browser?')) {
                clearAllTransferHistory();
                reloadHistory();
              }
            }}
            title="Clear local transfer history"
          >
            Clear History
          </button>
        </div>
      </div>

      {/* Live Personal Quota Telemetry Strip */}
      <div style={{
        padding: '12px 14px',
        marginBottom: 14,
        borderRadius: '10px',
        background: 'var(--bg-surface, #ffffff)',
        border: '1px solid var(--border-default, #e2e8f0)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--fg-default)' }}>
            Personal Storage Quota (Independent 1 GB)
          </span>
          <span style={{ fontSize: '0.78rem', fontWeight: 600, color: usedPercent > 80 ? 'var(--danger-fg, #ef4444)' : 'var(--fg-muted)' }}>
            {usedMb} MB / {maxMb} MB ({usedPercent}%)
          </span>
        </div>
        <div style={{
          height: 6,
          background: 'var(--border-subtle, #e2e8f0)',
          borderRadius: 3,
          overflow: 'hidden',
          position: 'relative'
        }}>
          <div style={{
            width: `${Math.min(100, usedPercent)}%`,
            height: '100%',
            background: usedPercent > 80 ? 'var(--danger-fg, #ef4444)' : 'var(--accent, #0066ff)',
            borderRadius: 3,
            transition: 'width 0.3s ease'
          }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, fontSize: '0.74rem', color: 'var(--fg-muted)' }}>
          <span>Your uploads do not affect other users.</span>
          <span>Auto-wiped on expiry (15s–3 min default).</span>
        </div>
        {storageMessage && (
          <div style={{ marginTop: 6, fontSize: '0.76rem', color: 'var(--success-fg, #10b981)', fontWeight: 500 }}>
            ✓ {storageMessage}
          </div>
        )}
      </div>

      <div className="sender-history-grid">
        {history.map((item) => {
          const isExpired = item.expiresAt && new Date(item.expiresAt).getTime() <= now;
          const isCancelled = item.status === 'cancelled';
          const isBurn = Boolean(item.burnOnRead ?? item.burn_on_read) || item.maxDownloads === 1;
          const isCurrent = item.fileId === activeTransferId;

          return (
            <div
              key={item.fileId}
              className={`sender-history-card ${isCurrent ? 'sender-history-card--current' : ''} ${isExpired || isCancelled ? 'sender-history-card--inactive' : ''}`}
            >
              <div className="history-card-top">
                <div className="history-card-info">
                  <div className="history-card-name-row">
                    <strong className="history-card-name" title={item.fileName}>
                      {item.fileName}
                    </strong>
                    {isCurrent && <span className="badge badge-emerald">Active Now</span>}
                    {isCancelled && <span className="badge badge-danger">Cancelled</span>}
                    {isExpired && !isCancelled && <span className="badge badge-slate">Expired</span>}
                    {!isExpired && !isCancelled && isBurn && (
                      <span className="badge badge-amber">
                        <Flame size={12} /> Burn on Read
                      </span>
                    )}
                  </div>
                  <div className="history-card-meta">
                    <span>{formatBytes(item.fileSize)}</span>
                    <span className="dot-sep">•</span>
                    <span>{item.fileCount} file{item.fileCount > 1 ? 's' : ''}</span>
                    <span className="dot-sep">•</span>
                    <span className="history-time-badge">
                      <Clock size={12} /> {formatRemainingTime(item.expiresAt)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="history-code-strip">
                <span className="history-code-val">
                  <Key size={13} /> {item.transferCode || item.fileId}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  onClick={() => handleCopyCode(item.transferCode || item.fileId, item.fileId)}
                  title="Copy 6-digit transfer code"
                >
                  {copiedId === item.fileId ? (
                    <>
                      <CheckCircle2 size={12} style={{ color: 'var(--success-fg)' }} /> Copied
                    </>
                  ) : (
                    <>
                      <Copy size={12} /> Copy
                    </>
                  )}
                </button>
              </div>

              <div className="history-card-footer">
                <div className="history-status-pill">
                  {isCancelled ? (
                    <span className="status-text text-muted">Deleted from server</span>
                  ) : isExpired ? (
                    <span className="status-text text-muted">Auto-purged on expiry</span>
                  ) : isBurn ? (
                    <span className="status-text text-warning">Active • Burn on Read</span>
                  ) : (
                    <span className="status-text text-primary">Active &amp; Ready</span>
                  )}
                </div>

                <div className="history-card-actions">
                  {onSelectTransferForQR && !isExpired && !isCancelled && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      onClick={() => onSelectTransferForQR(item)}
                      title="View QR Code and sharing link"
                    >
                      <Eye size={13} /> QR
                    </button>
                  )}

                  {!isExpired && !isCancelled ? (
                    <button
                      type="button"
                      className="btn btn-danger btn-xs"
                      onClick={() => handleCancelTransfer(item)}
                      disabled={cancellingId === item.fileId}
                      title="Cancel and permanently delete file from server"
                    >
                      <Trash2 size={13} /> Cancel
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      onClick={() => handleRemoveRecord(item.fileId)}
                      title="Remove from history list"
                    >
                      <Trash2 size={13} /> Clear
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
