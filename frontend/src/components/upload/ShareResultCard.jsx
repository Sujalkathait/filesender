import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  CheckCircle2, Copy, Trash2, Plus, Flame, Key, Clock,
  ShieldCheck, Share2, Eye, FileText, Check, Shield, QrCode, Maximize2
} from 'lucide-react';
import { formatBytes } from '../../utils/format';
import { copyToClipboard } from '../../utils/clipboard';
import { createShareMessage } from '../../crypto';
import { FileCategoryIcon } from '../common/FileCategoryIcon';
import { QRCodeModal } from './QRCodeModal';

/**
 * ShareResultCard Component
 * Primary Responsibility: Active Sender Dashboard Card rendered after successful upload.
 * Displays clean, organized telemetry boxes focused on the 10-Digit Transfer Code:
 * 1. File Details & In-Browser Preview
 * 2. 10-Digit Transfer Code (Copy, WhatsApp, Share Text)
 * 3. Expiry Countdown (Live animated timer)
 * 4. Transfer Security & Zero-Knowledge Verification
 * Note: Users never see download counts, download history, or internal transfer statistics.
 */
export function ShareResultCard({
  result,
  shareUrl,
  copied,
  onCopy,
  onNewUpload,
  onCancel,
  isCancelling,
  onPreviewFile,
  p2pState = 'idle'
}) {
  const [now, setNow] = useState(Date.now());
  const [copiedShareMsg, setCopiedShareMsg] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!result) return null;

  const isBurn = Boolean(result.burnOnRead ?? result.burn_on_read) || result.maxDownloads === 1;
  const expiresAtVal = result.expiresAt || result.expires_at;
  const createdAtVal = result.createdAt || result.created_at;
  const expiresTimestamp = expiresAtVal ? new Date(expiresAtVal).getTime() : 0;
  const createdTimestamp = createdAtVal ? new Date(createdAtVal).getTime() : 0;
  const remainingMillis = Math.max(0, expiresTimestamp - now);
  const totalSeconds = Math.floor(remainingMillis / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const isExpired = remainingMillis <= 0;

  const initialDuration = Math.max(
    15,
    expiresTimestamp && createdTimestamp && expiresTimestamp > createdTimestamp
      ? Math.round((expiresTimestamp - createdTimestamp) / 1000)
      : (Number(result.expiry_seconds) || Number(result.expiryHours) || 60)
  );

  const handleShareMessage = async () => {
    const msg = createShareMessage({
      transferCode: result.transferCode,
      shareUrl,
      expirySeconds: initialDuration,
      fileCount: result.fileCount || 1,
      totalSize: formatBytes(result.originalSize)
    });
    const ok = await copyToClipboard(msg);
    if (ok) {
      setCopiedShareMsg(true);
      setTimeout(() => setCopiedShareMsg(false), 2500);
    }
  };

  const handleWhatsAppShare = () => {
    const msg = createShareMessage({
      transferCode: result.transferCode,
      shareUrl,
      expirySeconds: initialDuration,
      fileCount: result.fileCount || 1,
      totalSize: formatBytes(result.originalSize)
    });
    const encoded = encodeURIComponent(msg);
    window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="upload-result sender-dashboard animate-in" role="region" aria-label="Sender Transfer Dashboard">
      {/* Success Banner */}
      <div className="result-header-banner">
        <div className="result-success-icon-wrap">
          <CheckCircle2 size={28} className="result-success-icon" />
        </div>
        <div className="result-header-text">
          <h3 className="result-title">Encrypted &amp; Ready to Share!</h3>
          <p className="result-subtitle">
            Your file was encrypted in your browser with zero server keys. Share the 10-digit code below to transfer.
          </p>
        </div>
      </div>

      {/* Burn After Read Alert */}
      {isBurn && (
        <div className="burn-banner">
          <Flame size={20} className="burn-icon" />
          <div>
            <strong className="burn-title">Burn After Read Active</strong>
            <span className="burn-copy">
              Permanently self-destructs and unlinks from server disk immediately once downloaded.
            </span>
          </div>
        </div>
      )}

      {/* ── ORGANIZED SENDER TELEMETRY BOXES (4 CLEAN CARDS) ── */}
      <div className="sender-dashboard-grid-7 sender-dashboard-grid-4">
        {/* BOX 1: FILE DETAILS & PREVIEW */}
        <div className="dashboard-box box-file-preview">
          <div className="dashboard-box-header">
            <div className="box-header-title">
              <FileText size={16} className="box-header-icon" />
              <span>1. File Details</span>
            </div>
            <span className="badge badge-slate">
              {result.fileCount > 1 ? `${result.fileCount} Files Bundle` : 'Single File'}
            </span>
          </div>
          <div className="box-preview-content">
            <div className="preview-thumb-wrap">
              <FileCategoryIcon fileName={result.originalName} size={28} />
            </div>
            <div className="preview-info-text">
              <strong className="preview-filename" title={result.originalName}>
                {result.originalName}
              </strong>
              <span className="preview-filesize">
                {formatBytes(result.originalSize)} • AES-256 Encrypted
              </span>
            </div>
          </div>
          {onPreviewFile && (
            <button
              type="button"
              className="btn btn-secondary btn-sm box-preview-btn"
              onClick={onPreviewFile}
              title="Inspect file contents in browser"
            >
              <Eye size={13} /> View File Preview
            </button>
          )}
        </div>

        {/* BOX 2: 10-DIGIT TRANSFER CODE & SENDER QR */}
        <div className="dashboard-box box-transfer-code">
          <div className="dashboard-box-header">
            <div className="box-header-title">
              <Key size={16} className="box-header-icon" />
              <span>2. Transfer Code &amp; QR</span>
            </div>
            <span className="badge badge-emerald">10 Digits</span>
          </div>
          <div className="dashboard-code-display">
            <span className="dashboard-code-text">{result.transferCode}</span>
          </div>

          {/* Sender QR Code Display */}
          <div
            className="sender-qr-inline-card"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '12px',
              margin: '10px 0',
              background: 'var(--bg-subtle, #f8fafc)',
              borderRadius: '12px',
              border: '1px solid var(--border-default, #e2e8f0)',
              position: 'relative'
            }}
          >
            <div
              style={{
                padding: '8px',
                background: '#ffffff',
                borderRadius: '8px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                cursor: 'pointer'
              }}
              onClick={() => setShowQRModal(true)}
              title="Click to expand QR Code"
            >
              <QRCodeSVG
                value={
                  (shareUrl && shareUrl.startsWith('http'))
                    ? shareUrl
                    : (typeof window !== 'undefined'
                        ? `${window.location.origin}/download?code=${encodeURIComponent(result.transferCode || result.fileId || '')}`
                        : (result.transferCode || ''))
                }
                size={130}
                bgColor="#ffffff"
                fgColor="#0f172a"
                level="H"
                includeMargin={false}
              />
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={() => setShowQRModal(true)}
              style={{ marginTop: 6, fontSize: '0.78rem', color: 'var(--accent, #0066ff)' }}
              title="Expand QR Code full screen"
            >
              <QrCode size={13} /> View / Expand QR
            </button>
          </div>

          <div className="dashboard-code-actions-row" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-primary btn-md box-copy-btn"
              onClick={onCopy}
              style={{ flex: 1 }}
              title="Copy 10-digit code to clipboard"
            >
              {copied ? (
                <>
                  <CheckCircle2 size={16} /> Copied!
                </>
              ) : (
                <>
                  <Copy size={16} /> Copy Code
                </>
              )}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-md"
              onClick={handleWhatsAppShare}
              title="Share transfer code directly on WhatsApp"
            >
              <Share2 size={15} /> WhatsApp
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-md"
              onClick={handleShareMessage}
              title="Copy formatted message with transfer instructions"
            >
              <Copy size={15} /> {copiedShareMsg ? 'Copied' : 'Share Text'}
            </button>
          </div>
          <span className="dashboard-box-hint">
            Scan QR code or enter this 10-digit code on recipient device to receive file.
          </span>
        </div>

        {/* BOX 3: EXPIRY COUNTDOWN */}
        <div className="dashboard-box box-expiry-time">
          <div className="dashboard-box-header">
            <div className="box-header-title">
              <Clock size={16} className="box-header-icon" />
              <span>3. Expiry Countdown</span>
            </div>
            <span className={`badge ${totalSeconds < 15 ? 'badge-amber' : 'badge-primary'}`}>
              {isExpired ? 'Expired' : totalSeconds >= 60 ? `${minutes}m ${seconds > 0 ? `${seconds}s ` : ''}Left` : `${totalSeconds}s Left`}
            </span>
          </div>
          <div className="dashboard-metric-hero">
            <Clock size={20} className={totalSeconds < 15 ? 'text-warning' : 'text-primary'} />
            <span className={`hero-val ${totalSeconds < 15 ? 'text-warning' : ''}`}>
              {isExpired ? '00:00' : `${minutes > 0 ? `${minutes}m ` : ''}${seconds < 10 ? '0' : ''}${seconds}s`}
            </span>
          </div>
          <p className="dashboard-metric-subtext">
            {isExpired
              ? 'File expired & automatically erased from server.'
              : 'Auto-destructs strictly when countdown reaches zero.'}
          </p>
          <div className="dashboard-progress-track">
            <div
              className="dashboard-progress-fill"
              style={{
                width: `${Math.max(0, Math.min(100, (totalSeconds / initialDuration) * 100))}%`,
                backgroundColor: totalSeconds < 15 ? 'var(--warning-fg)' : 'var(--accent)'
              }}
            />
          </div>
        </div>

        {/* BOX 4: TRANSFER STATUS & ZERO-KNOWLEDGE SECURITY */}
        <div className="dashboard-box box-transfer-status">
          <div className="dashboard-box-header">
            <div className="box-header-title">
              <ShieldCheck size={16} className="box-header-icon" />
              <span>4. Security &amp; Privacy</span>
            </div>
            <span className="badge badge-emerald">Protected</span>
          </div>
          <div className="dashboard-status-list">
            <div className="status-item-row">
              <Check size={14} className="text-success" />
              <span>AES-256-GCM Zero-Knowledge</span>
            </div>
            <div className="status-item-row">
              <Check size={14} className="text-success" />
              <span>Keys never leave your device</span>
            </div>
            <div className="status-item-row">
              <Check size={14} className="text-success" />
              <span>{isBurn ? 'Self-destructs on download' : 'Auto-purged when timer expires'}</span>
            </div>
          </div>
          <span className="dashboard-box-hint">
            State: {isExpired ? 'Expired' : 'Active & Ready for Recipient'}
          </span>
        </div>
      </div>

      {/* Sender Actions Footer */}
      <div className="result-actions-footer">
        <button
          type="button"
          onClick={onCancel}
          disabled={isCancelling}
          className="btn btn-danger btn-md"
          title="Permanently remove file from server immediately"
        >
          <Trash2 size={16} />
          {isCancelling ? 'Deleting...' : 'Cancel & Purge File Now'}
        </button>

        <button
          type="button"
          onClick={onNewUpload}
          className="btn btn-primary btn-md"
          title="Start sending another file"
        >
          <Plus size={16} /> Send Another File
        </button>
      </div>

      <QRCodeModal
        isOpen={showQRModal}
        onClose={() => setShowQRModal(false)}
        transferCode={result.transferCode}
        shareUrl={shareUrl}
        fileName={result.originalName}
      />
    </div>
  );
}

export default ShareResultCard;
