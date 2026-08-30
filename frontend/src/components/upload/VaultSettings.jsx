import React from 'react';
import { Flame, Image as ImageIcon, Radio, Clock, HelpCircle, ShieldCheck, Info } from 'lucide-react';

const EXPIRY_PRESETS = [
  { value: 15, label: '15s', fullLabel: '15 seconds', hint: 'Ultra fast temporary transfer' },
  { value: 30, label: '30s', fullLabel: '30 seconds', hint: 'Quick verification transfer' },
  { value: 45, label: '45s', fullLabel: '45 seconds', hint: 'Fast temporary transfer' },
  { value: 60, label: '1 min', fullLabel: '60 seconds (1 min)', hint: 'Standard recommended countdown' },
  { value: 90, label: '1.5 min', fullLabel: '90 seconds (1.5 min)', hint: 'Medium duration transfer' },
  { value: 120, label: '2 min', fullLabel: '2 minutes (120s)', hint: 'Extended duration transfer' },
  { value: 180, label: '3 min', fullLabel: '3 minutes (180s)', hint: 'Maximum allowed countdown' },
];

/**
 * VaultSettings Component
 * Primary Responsibility: Handle security & privacy options (Steganography, Direct P2P)
 * and code expiry countdown selection (15s up to 3 minutes).
 * Burn After Read is always enabled — no toggle needed.
 */
export function VaultSettings({
  useSteganography,
  setUseSteganography,
  useP2P,
  setUseP2P,
  expiryHours,
  setExpiryHours,
  isTransferring,
  onOpenGuide
}) {
  const currentPreset = EXPIRY_PRESETS.find(p => p.value === expiryHours) || {
    value: expiryHours,
    label: `${expiryHours}s`,
    fullLabel: `${expiryHours} seconds`,
    hint: 'Custom countdown'
  };

  return (
    <div className="vault-settings" role="region" aria-label="Privacy and Expiry Settings">
      <div className="vault-settings-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <ShieldCheck size={18} className="text-primary" />
          <h4 className="settings-heading" style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>
            Sharing &amp; Privacy Options
          </h4>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-xs"
          onClick={onOpenGuide}
          style={{ fontSize: '0.775rem', gap: 4 }}
          aria-label="Open feature guide"
        >
          <HelpCircle size={14} /> Feature Guide
        </button>
      </div>

      {/* Burn-on-Read: Always Active Info Banner */}
      <div
        className="vault-option-card active"
        style={{ cursor: 'default', pointerEvents: 'none' }}
      >
        <div className="option-card__content">
          <div className="option-card__copy">
            <div className="option-card__icon option-card__icon--danger">
              <Flame size={18} />
            </div>
            <div>
              <div className="option-card__title-row">
                <strong className="option-card__title">Burn After Read (Self-Destruct)</strong>
                <span className="badge badge-amber">ALWAYS ON</span>
              </div>
              <span className="option-card__description">
                Every file permanently self-destructs from the server immediately once downloaded. No data is ever stored.
              </span>
            </div>
          </div>
          <ShieldCheck size={20} className="text-success" style={{ flexShrink: 0 }} />
        </div>
        <div className="vault-option-helper" style={{ pointerEvents: 'auto' }}>
          <div className="vault-helper-pane" style={{ padding: '8px 12px', marginTop: 4 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: '0.8rem', color: 'var(--fg-muted)' }}>
              <Info size={14} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>In-browser previews do not consume the transfer, so recipients can safely inspect files before completing their download.</span>
            </div>
          </div>
        </div>
      </div>

      {/* Option 2: Image Steganography */}
      <div
        className={`vault-option-card ${useSteganography ? 'active' : ''}`}
        onClick={() => !isTransferring && setUseSteganography(!useSteganography)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !isTransferring && setUseSteganography(!useSteganography)}
        aria-expanded={useSteganography}
      >
        <div className="option-card__content">
          <div className="option-card__copy">
            <div className="option-card__icon option-card__icon--success">
              <ImageIcon size={18} />
            </div>
            <div>
              <div className="option-card__title-row">
                <strong className="option-card__title">Steganography Image Vault</strong>
                <span className="badge badge-emerald">STEALTH &lt;10MB</span>
              </div>
              <span className="option-card__description">
                Conceals encrypted payload bytes inside standard PNG pixels to bypass inspection filters.
              </span>
            </div>
          </div>
          <input
            type="checkbox"
            checked={useSteganography}
            disabled={isTransferring}
            onChange={(e) => {
              e.stopPropagation();
              setUseSteganography(e.target.checked);
            }}
            className="option-checkbox"
            aria-label="Steganography mode"
          />
        </div>
      </div>

      {/* Option 3: Direct P2P */}
      <div
        className={`vault-option-card ${useP2P ? 'active' : ''}`}
        onClick={() => !isTransferring && setUseP2P(!useP2P)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !isTransferring && setUseP2P(!useP2P)}
        aria-expanded={useP2P}
      >
        <div className="option-card__content">
          <div className="option-card__copy">
            <div className="option-card__icon option-card__icon--primary">
              <Radio size={18} />
            </div>
            <div>
              <div className="option-card__title-row">
                <strong className="option-card__title">Direct P2P Transfer (WebRTC)</strong>
                <span className="badge badge-primary">ZERO SERVER DISK</span>
              </div>
              <span className="option-card__description">
                Streams directly peer-to-peer between devices without storing files on intermediary servers.
              </span>
            </div>
          </div>
          <input
            type="checkbox"
            checked={useP2P}
            disabled={isTransferring}
            onChange={(e) => {
              e.stopPropagation();
              setUseP2P(e.target.checked);
            }}
            className="option-checkbox"
            aria-label="Direct P2P transfer"
          />
        </div>
      </div>

      {/* ── CODE EXPIRY COUNTDOWN SELECTION (15s to 3 min) ── */}
      <div className="expiry-selection-box" style={{
        marginTop: 14,
        padding: '14px 16px',
        background: 'var(--bg-surface, #ffffff)',
        border: '1px solid var(--border-default, #e2e8f0)',
        borderRadius: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Clock size={16} className="text-primary" />
            <label htmlFor="expiry-select" style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--fg-default)' }}>
              Code Expiry Countdown
            </label>
          </div>
          <span className="badge badge-primary" style={{ fontSize: '0.75rem' }}>
            {currentPreset.label}
          </span>
        </div>

        {/* Quick Selection Pills (15s up to 3 min) */}
        <div
          className="expiry-pills-row"
          style={{
            display: 'flex',
            gap: 6,
            flexWrap: 'wrap',
            marginBottom: 10
          }}
          role="radiogroup"
          aria-label="Expiry countdown options"
        >
          {EXPIRY_PRESETS.map((preset) => {
            const isSelected = expiryHours === preset.value;
            return (
              <button
                key={preset.value}
                type="button"
                className={`expiry-pill-btn ${isSelected ? 'expiry-pill-btn--active' : ''}`}
                onClick={() => !isTransferring && setExpiryHours(preset.value)}
                disabled={isTransferring}
                style={{
                  flex: '1 1 auto',
                  minWidth: '58px',
                  padding: '6px 10px',
                  fontSize: '0.8rem',
                  fontWeight: isSelected ? 600 : 500,
                  borderRadius: '8px',
                  border: `1px solid ${isSelected ? 'var(--accent, #0066ff)' : 'var(--border-default, #e2e8f0)'}`,
                  background: isSelected ? 'var(--accent-subtle, #eff6ff)' : 'var(--bg-subtle, #f8fafc)',
                  color: isSelected ? 'var(--accent, #0066ff)' : 'var(--fg-default)',
                  cursor: isTransferring ? 'not-allowed' : 'pointer',
                  transition: 'var(--transition-fast, all 0.15s ease)'
                }}
                aria-checked={isSelected}
                role="radio"
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <select
            id="expiry-select"
            value={expiryHours}
            disabled={isTransferring}
            onChange={(e) => setExpiryHours(Number(e.target.value))}
            aria-label="Select code expiration countdown"
            style={{
              padding: '6px 10px',
              borderRadius: '8px',
              border: '1px solid var(--border-default, #e2e8f0)',
              background: 'var(--bg-app, #ffffff)',
              color: 'var(--fg-default)',
              fontSize: '0.85rem',
              flex: 1
            }}
          >
            {EXPIRY_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.fullLabel}
              </option>
            ))}
          </select>

          <span style={{ fontSize: '0.78rem', color: 'var(--fg-muted)', flex: '1 1 100%' }}>
            ⏱ {currentPreset.hint}. Transfer code and file will automatically self-destruct once countdown reaches zero.
          </span>
        </div>
      </div>
    </div>
  );
}

export default VaultSettings;
