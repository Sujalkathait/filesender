import React, { useState, useEffect } from 'react';
import {
  FileText, Flame, Radio, Key, Loader2, Eye, Lock,
  ShieldCheck, Clock, CheckCircle2, Shield, Info, Download, Archive
} from 'lucide-react';
import { formatBytes } from '../../utils/format';
import { MeasurableProgressBar } from '../FeedbackStates';
import { FileCategoryIcon } from '../common/FileCategoryIcon';
import { Button } from '../ui/button';
import { Spinner } from '../ui/spinner';
import { Progress } from '../ui/progress';

/**
 * DownloadFileCard Component
 * Primary Responsibility: Render receiver file verification overview, metadata telemetry,
 * download limit policy, zero-knowledge reassurance, and download triggers.
 */
export function DownloadFileCard({
  fileInfo,
  isBurned,
  p2pStatus,
  p2pState,
  needsKey,
  manualKey,
  setManualKey,
  progress,
  isDecrypting,
  statusMessage,
  onExecuteDownload,
  onPreviewReady,
  onExpire
}) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!fileInfo) return null;

  const isBurn = Boolean(fileInfo.burnOnRead ?? fileInfo.burn_on_read) || fileInfo.maxDownloads === 1 || fileInfo.max_downloads === 1;
  const fileCount = fileInfo.file_count || fileInfo.fileCount || 1;
  const isBundle = fileCount > 1 || (fileInfo.original_name || '').endsWith('.bundle');

  const maxPreviews = fileInfo.max_previews || fileInfo.maxPreviews || 2;
  const previewCount = fileInfo.preview_count || fileInfo.previewCount || 0;
  const previewsRemaining = fileInfo.previews_remaining !== undefined && fileInfo.previews_remaining !== null
    ? fileInfo.previews_remaining
    : (fileInfo.previewsRemaining !== undefined && fileInfo.previewsRemaining !== null
        ? fileInfo.previewsRemaining
        : Math.max(0, maxPreviews - previewCount));
  const isPrevExhausted = previewsRemaining <= 0;

  const maxDownloads = fileInfo.max_downloads || fileInfo.maxDownloads || 2;
  const downloadCount = fileInfo.download_count || fileInfo.downloadCount || 0;
  const downloadsRemaining = fileInfo.downloads_remaining !== undefined && fileInfo.downloads_remaining !== null
    ? fileInfo.downloads_remaining
    : (fileInfo.downloadsRemaining !== undefined && fileInfo.downloadsRemaining !== null
        ? fileInfo.downloadsRemaining
        : Math.max(0, maxDownloads - downloadCount));
  const isDownExhausted = downloadsRemaining <= 0;

  const expiresAtVal = fileInfo.expiresAt || fileInfo.expires_at;
  const expiresTimestamp = expiresAtVal ? new Date(expiresAtVal).getTime() : 0;
  const remainingMillis = Math.max(0, expiresTimestamp - now);
  const totalSeconds = Math.floor(remainingMillis / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const isExpired = remainingMillis <= 0;

  useEffect(() => {
    if (isExpired && onExpire) {
      onExpire();
    }
  }, [isExpired, onExpire]);

  return (
    <div className="file-info animate-in" role="region" aria-label="Transfer Verification & Details">
      {/* File Header */}
      <div className="file-info-header">
        <div className="file-icon file-icon--success">
          <FileCategoryIcon fileName={fileInfo.original_name} mimeType={fileInfo.mime_type} size={24} />
        </div>
        <div className="file-details">
          <h4 className="file-details-name">{fileInfo.original_name}</h4>
          <p className="file-details-meta">
            <span className="file-size-badge">{formatBytes(fileInfo.original_size)}</span>
            <span className="dot-sep">•</span>
            <span>Zero-Knowledge AES-256-GCM</span>
          </p>
        </div>
      </div>

      {/* Receiver Verification Telemetry Grid */}
      <div className="transfer-telemetry-grid">
        <div className="telemetry-card">
          <span className="telemetry-label">Transfer Size</span>
          <span className="telemetry-val">{formatBytes(fileInfo.original_size)}</span>
        </div>
        <div className="telemetry-card">
          <span className="telemetry-label">Encryption</span>
          <span className="telemetry-val text-success">
            <ShieldCheck size={13} /> AES-256-GCM
          </span>
        </div>
        <div className="telemetry-card">
          <span className="telemetry-label">Time Remaining</span>
          <span className={`telemetry-val ${totalSeconds < 15 ? 'text-warning' : 'text-primary'}`}>
            <Clock size={13} /> {isExpired ? 'Expired' : `${minutes}m ${seconds < 10 ? '0' : ''}${seconds}s`}
          </span>
        </div>
        <div className="telemetry-card">
          <span className="telemetry-label">Security Seal</span>
          <span className="telemetry-val text-success">
            <ShieldCheck size={13} /> Verified E2E
          </span>
        </div>
      </div>

      {/* Bundle Info Notice */}
      {isBundle && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)', padding: '8px 12px',
          fontSize: '0.8rem', color: 'var(--fg-muted)', marginBottom: 12
        }}>
          <Archive size={14} style={{ flexShrink: 0, color: 'var(--accent)' }} />
          <span>This transfer contains <strong>{fileCount} files</strong>. They will be downloaded together as a single <strong>.zip</strong> archive.</span>
        </div>
      )}

      {/* Burn After Read Alert */}
      {isBurn && !isBurned && (
        <div className="burn-banner">
          <Flame size={20} className="burn-icon" />
          <div>
            <strong className="burn-title">Burn After Read Active</strong>
            <span className="burn-copy">
              This file permanently self-destructs from the server immediately after your download finishes.
            </span>
          </div>
        </div>
      )}

      {p2pStatus && (p2pState === 'waiting' || p2pState === 'connected') && (
        <div className="status-message info" style={{ marginBottom: 16 }}>
          <Radio size={16} />
          <span>{p2pStatus} REST download below still works.</span>
        </div>
      )}

      {/* Key Prompt if key missing from URL/code */}
      {needsKey && !isBurned && (
        <div className="manual-key-section">
          <div className="status-message info">
            <Key size={16} />
            <span>Decryption key required</span>
          </div>
          <input
            type="text"
            placeholder="Paste 5-char or full decryption key..."
            value={manualKey}
            onChange={(e) => setManualKey(e.target.value)}
            className="manual-key-input"
            aria-label="Decryption key input"
          />
        </div>
      )}

      {/* Progress feedback while decrypting / downloading matching Image 1 */}
      {progress && isDecrypting && (
        <div className="download-progress-card">
          <div className="download-progress-top">
            <div className="download-progress-left">
              <Spinner size={20} className="download-progress-spinner" />
              <div className="download-progress-info">
                <span className="download-progress-title">Downloading...</span>
                <span className="download-progress-bytes">
                  {formatBytes(progress.transferredBytes || 0)} / {formatBytes(progress.totalBytes || fileInfo.original_size)}
                </span>
              </div>
            </div>
            <button type="button" className="download-progress-cancel-btn">Cancel</button>
          </div>
          <div className="download-progress-track">
            <div 
              className="download-progress-fill" 
              style={{ width: `${Math.min(100, Math.max(0, progress.percent || 0))}%` }} 
            />
          </div>
        </div>
      )}

      {!isBurned && (
        <div className="two-step-download-section" style={{ marginTop: 20 }}>
          <div style={{
            fontSize: '0.75rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--fg-muted)',
            marginBottom: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}>
            <Shield size={14} className="text-primary" />
            <span>Two Independent Verification Steps</span>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 14,
            marginBottom: 10
          }}>
            {/* Step 1: Preview in Browser (In-Memory, Max 2 Views) */}
            <div style={{
              padding: '16px',
              borderRadius: '12px',
              border: `1px solid ${isPrevExhausted ? 'var(--border-subtle, #e2e8f0)' : 'var(--border-default, #cbd5e1)'}`,
              background: isPrevExhausted ? 'var(--bg-subtle, #f8fafc)' : 'var(--bg-surface, #ffffff)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              opacity: isPrevExhausted ? 0.7 : 1,
              transition: 'var(--transition-fast, all 0.2s ease)'
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: '0.725rem', fontWeight: 700, color: 'var(--accent, #0066ff)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Step 1 • In-Memory Preview
                  </span>
                  <span className={`badge ${isPrevExhausted ? 'badge-slate' : 'badge-primary'}`} style={{ fontSize: '0.72rem' }}>
                    {previewsRemaining} / {maxPreviews} Views Left
                  </span>
                </div>
                <h5 style={{ margin: '0 0 6px 0', fontSize: '0.95rem', fontWeight: 600 }}>
                  Safe In-Browser Preview
                </h5>
                <p style={{ margin: '0 0 14px 0', fontSize: '0.78rem', color: 'var(--fg-muted)', lineHeight: 1.45 }}>
                  Safely open and inspect files inside browser memory without saving to disk. Up to {maxPreviews} views allowed.
                </p>
              </div>

              <button
                type="button"
                className="btn btn-secondary"
                style={{ width: '100%', justifyContent: 'center', minHeight: '42px' }}
                onClick={() => onExecuteDownload(false, onPreviewReady)}
                disabled={isDecrypting || isPrevExhausted}
                title={isPrevExhausted ? 'Maximum 2 views used. Please proceed to Step 2 to save to disk.' : 'Inspect files safely in browser memory'}
                aria-label="Preview files in browser memory"
              >
                {isDecrypting ? <Spinner size={16} className="mr-2" /> : <Eye size={16} className="mr-2" />}
                <span>{isPrevExhausted ? '2/2 Views Used' : 'Preview Files (In-Memory)'}</span>
              </button>
            </div>

            {/* Step 2: Download & Save to Disk (Max 2 Saves) */}
            <div style={{
              padding: '16px',
              borderRadius: '12px',
              border: '1px solid var(--accent, #0066ff)',
              background: 'var(--bg-surface, #ffffff)',
              boxShadow: '0 4px 16px rgba(0, 102, 255, 0.08)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              transition: 'var(--transition-fast, all 0.2s ease)'
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: '0.725rem', fontWeight: 700, color: 'var(--success-fg, #10b981)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Step 2 • Save to Disk
                  </span>
                  <span className="badge badge-emerald" style={{ fontSize: '0.72rem' }}>
                    {downloadsRemaining} / {maxDownloads} Saves Left
                  </span>
                </div>
                <h5 style={{ margin: '0 0 6px 0', fontSize: '0.95rem', fontWeight: 600 }}>
                  Download to Device
                </h5>
                <p style={{ margin: '0 0 14px 0', fontSize: '0.78rem', color: 'var(--fg-muted)', lineHeight: 1.45 }}>
                  Download and save decrypted files to disk. Automatically self-destructs permanently after {maxDownloads} saves.
                </p>
              </div>

              <button
                type="button"
                className="btn btn-primary"
                style={{ width: '100%', justifyContent: 'center', minHeight: '42px' }}
                onClick={() => onExecuteDownload(true)}
                disabled={isDecrypting || isDownExhausted}
                aria-busy={isDecrypting}
                aria-label="Save and download file to disk"
              >
                {isDecrypting ? (
                  <>
                    <Spinner size={16} className="mr-2" /> Decrypting...
                  </>
                ) : (
                  <>
                    <Download size={16} className="mr-2" /> Save &amp; Download to Disk
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
