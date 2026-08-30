import React, { useEffect, useRef } from 'react';
import { Shield, X } from 'lucide-react';
import { formatBytes } from '../../utils/format';

export const formatExpiryLabel = (seconds) => {
  const s = Math.round(seconds <= 1 && seconds > 0 ? seconds * 60 : seconds);
  if (s < 60) return `${s} seconds`;
  if (s === 60) return '60 seconds (1 min)';
  if (s === 3600) return '60 minutes (1 hour)';
  const mins = Math.floor(s / 60);
  const remSec = s % 60;
  if (remSec === 0) return `${mins} minute${mins > 1 ? 's' : ''} (${s}s)`;
  return `${mins}m ${remSec}s (${s}s)`;
};

/**
 * TransferConfirmModal Component
 * Primary Responsibility: Display modal review of file list, total size, optimization tier, and security settings before confirming upload.
 */
export function TransferConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  files,
  totalSelectedSize,
  isSmartOptimized,
  currentOpt,
  useSteganography,
  expiryHours
}) {
  const closeBtnRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    closeBtnRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="preview-overlay" role="dialog" aria-modal="true" aria-label="Confirm Transfer Details">
      <div className="preview-modal modal-narrow">
        <div className="preview-header">
          <h3><Shield size={18} /> Confirm Transfer</h3>
          <button
            className="preview-close"
            onClick={onClose}
            aria-label="Close modal"
            ref={closeBtnRef}
          >
            <X size={18} />
          </button>
        </div>
        <div className="preview-body">
          <div className="confirmation-notice">
            Please review your selected file(s) and security settings before starting the browser-encrypted upload.
          </div>

          <div className="confirmation-row">
            <label>Files</label>
            <span className="word-break">{files.length} file(s) ({files.map(f => f.name).join(', ')})</span>
          </div>
          <div className="confirmation-row">
            <label>Total Size</label>
            <span>{formatBytes(totalSelectedSize)}</span>
          </div>
          <div className="confirmation-row">
            <label>Optimization</label>
            <span>
              {isSmartOptimized ? `✓ Smart Optimized (${currentOpt ? currentOpt.mode : 'Standard'})` : '⚙ Custom Configuration'}
            </span>
          </div>
          <div className="confirmation-row">
            <label>Sharing Mode</label>
            <span>
              {useSteganography
                ? 'Burn-on-Read (Self-Destruct) + Steganography'
                : 'Burn-on-Read (Self-Destruct)'}
            </span>
          </div>
          <div className="confirmation-row" style={{ borderBottom: 'none' }}>
            <label>Code Expiry</label>
            <span>{formatExpiryLabel(expiryHours)}</span>
          </div>
        </div>
        <div className="preview-footer">
          <button className="btn btn-secondary btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary btn-sm" onClick={onConfirm}>
            Start Encrypted Transfer
          </button>
        </div>
      </div>
    </div>
  );
}
