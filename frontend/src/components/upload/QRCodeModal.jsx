import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { X, Copy, CheckCircle2, QrCode, Download, Share2 } from 'lucide-react';
import { copyToClipboard } from '../../utils/clipboard';

/**
 * QRCodeModal Component
 * Displays the 10-Digit Transfer Code and high-contrast QR Code for sender sharing.
 */
export function QRCodeModal({ isOpen, onClose, transferCode, shareUrl, fileName }) {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  if (!isOpen) return null;

  const fullUrl = (shareUrl && shareUrl.startsWith('http'))
    ? shareUrl
    : (typeof window !== 'undefined'
        ? `${window.location.origin}/download?code=${encodeURIComponent(transferCode || '')}`
        : (transferCode || ''));

  const handleCopyCode = async () => {
    if (!transferCode) return;
    const ok = await copyToClipboard(transferCode);
    if (ok) {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const handleCopyLink = async () => {
    if (!fullUrl) return;
    const ok = await copyToClipboard(fullUrl);
    if (ok) {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  return (
    <div
      className="modal-overlay animate-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-modal-title"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 16
      }}
    >
      <div
        className="modal-content card"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 420,
          background: 'var(--bg-surface, #ffffff)',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: 'var(--shadow-modal)',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center'
        }}
      >
        <button
          type="button"
          className="btn btn-ghost btn-xs"
          onClick={onClose}
          aria-label="Close QR Modal"
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            padding: 6,
            borderRadius: '50%'
          }}
        >
          <X size={18} />
        </button>

        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 44,
            height: 44,
            borderRadius: '50%',
            background: 'var(--accent-subtle, #eff6ff)',
            color: 'var(--accent, #0066ff)',
            marginBottom: 8
          }}>
            <QrCode size={24} />
          </div>
          <h3 id="qr-modal-title" style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: 'var(--fg-default)' }}>
            Sender QR Code
          </h3>
          {fileName && (
            <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--fg-muted)' }}>
              {fileName}
            </p>
          )}
        </div>

        {/* 10-Digit Transfer Code Badge */}
        <div style={{
          padding: '10px 16px',
          background: 'var(--bg-subtle, #f1f5f9)',
          borderRadius: '10px',
          marginBottom: 16,
          textAlign: 'center',
          width: '100%'
        }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--fg-muted)', display: 'block' }}>
            10-Digit Transfer Code
          </span>
          <strong style={{ fontSize: '1.3rem', fontFamily: 'monospace', letterSpacing: '0.08em', color: 'var(--accent, #0066ff)' }}>
            {transferCode}
          </strong>
        </div>

        {/* QR Code SVG */}
        <div style={{
          padding: 16,
          background: '#ffffff',
          borderRadius: 16,
          border: '1px solid var(--border-default, #e2e8f0)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          marginBottom: 16
        }}>
          <QRCodeSVG
            value={fullUrl}
            size={180}
            bgColor="#ffffff"
            fgColor="#0f172a"
            level="H"
            includeMargin={false}
          />
        </div>

        <p style={{ fontSize: '0.82rem', color: 'var(--fg-muted)', textAlign: 'center', margin: '0 0 20px 0' }}>
          Scan with a smartphone camera or receiver scanner to immediately load & unlock this transfer.
        </p>

        {/* Modal Action Buttons */}
        <div style={{ display: 'flex', gap: 10, width: '100%' }}>
          <button
            type="button"
            className="btn btn-primary btn-md"
            onClick={handleCopyCode}
            style={{ flex: 1 }}
          >
            {copiedCode ? <CheckCircle2 size={16} /> : <Copy size={16} />}
            {copiedCode ? 'Copied Code!' : 'Copy Code'}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-md"
            onClick={handleCopyLink}
            style={{ flex: 1 }}
          >
            {copiedLink ? <CheckCircle2 size={16} /> : <Share2 size={16} />}
            {copiedLink ? 'Copied Link!' : 'Copy Link'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default QRCodeModal;
