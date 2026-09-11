import React from 'react';
import { Flame, Image as ImageIcon, Radio, Clock, HelpCircle, ShieldCheck, Info } from 'lucide-react';

const EXPIRY_PRESETS = [
  { value: 15, label: '15s', fullLabel: '15 seconds', hint: 'Ultra fast instant burn' },
  { value: 30, label: '30s', fullLabel: '30 seconds', hint: 'Quick verification transfer' },
  { value: 45, label: '45s', fullLabel: '45 seconds', hint: 'Fast temporary transfer' },
  { value: 54, label: '54s', fullLabel: '54 seconds', hint: 'Ultra-fast auto-wipe countdown' },
  { value: 60, label: '1 min', fullLabel: '60 seconds (1 min - Recommended)', hint: 'Standard recommended countdown' },
  { value: 120, label: '2 min', fullLabel: '2 minutes (120s)', hint: 'Medium duration transfer' },
  { value: 180, label: '3 min', fullLabel: '3 minutes (180s - Max)', hint: 'Maximum allowed countdown (3 min)' },
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
    label: expiryHours >= 60 ? `${Math.round(expiryHours / 60)} min` : `${expiryHours}s`,
    fullLabel: `${expiryHours} seconds`,
    hint: 'Custom countdown'
  };

  return (
    <div className="vault-settings" role="region" aria-label="Privacy and Expiry Settings">
      <div className="vault-settings-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <ShieldCheck size={16} className="text-primary" />
          <h4 className="settings-heading" style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600 }}>
            Transfer &amp; Expiry Options
          </h4>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-xs"
          onClick={onOpenGuide}
          style={{ fontSize: '0.75rem', gap: 4 }}
          aria-label="Open feature guide"
        >
          <HelpCircle size={13} /> Guide
        </button>
      </div>

      {/* Compact Toggles Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 8, marginBottom: 10 }}>
        {/* Option: Steganography */}
        <label
          className={`compact-toggle-card ${useSteganography ? 'active' : ''}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 12px',
            border: `1px solid ${useSteganography ? 'var(--accent, #0066ff)' : 'var(--border-default, #e2e8f0)'}`,
            borderRadius: '8px',
            background: useSteganography ? 'var(--accent-subtle, #eff6ff)' : 'var(--bg-surface, #f9fafb)',
            cursor: isTransferring ? 'not-allowed' : 'pointer',
            userSelect: 'none',
            fontSize: '0.8125rem'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ImageIcon size={16} className="text-success" />
            <div>
              <div style={{ fontWeight: 600, color: 'var(--fg-default)' }}>Steganography Vault</div>
              <div style={{ fontSize: '0.725rem', color: 'var(--fg-muted)' }}>Hide encrypted file in PNG image (&lt;10 MB)</div>
            </div>
          </div>
          <input
            type="checkbox"
            checked={useSteganography}
            disabled={isTransferring}
            onChange={(e) => setUseSteganography(e.target.checked)}
            style={{ accentColor: 'var(--accent, #0066ff)', marginLeft: 8 }}
          />
        </label>

        {/* Option: Direct P2P */}
        <label
          className={`compact-toggle-card ${useP2P ? 'active' : ''}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 12px',
            border: `1px solid ${useP2P ? 'var(--accent, #0066ff)' : 'var(--border-default, #e2e8f0)'}`,
            borderRadius: '8px',
            background: useP2P ? 'var(--accent-subtle, #eff6ff)' : 'var(--bg-surface, #f9fafb)',
            cursor: isTransferring ? 'not-allowed' : 'pointer',
            userSelect: 'none',
            fontSize: '0.8125rem'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Radio size={16} className="text-primary" />
            <div>
              <div style={{ fontWeight: 600, color: 'var(--fg-default)' }}>Direct P2P Stream</div>
              <div style={{ fontSize: '0.725rem', color: 'var(--fg-muted)' }}>Direct WebRTC (zero server storage)</div>
            </div>
          </div>
          <input
            type="checkbox"
            checked={useP2P}
            disabled={isTransferring}
            onChange={(e) => setUseP2P(e.target.checked)}
            style={{ accentColor: 'var(--accent, #0066ff)', marginLeft: 8 }}
          />
        </label>
      </div>

      {/* Compact Expiry Bar */}
      <div style={{
        padding: '10px 12px',
        background: 'var(--bg-surface, #f9fafb)',
        border: '1px solid var(--border-default, #e2e8f0)',
        borderRadius: '8px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8125rem', fontWeight: 600 }}>
            <Clock size={15} className="text-primary" />
            <span>Expiry Countdown</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: 'var(--fg-muted)' }}>
            <Flame size={14} className="text-amber-500" />
            <span>Burn-after-read active</span>
          </div>
        </div>

        {/* Preset Pills */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} role="radiogroup" aria-label="Expiry countdown options">
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
                  minWidth: '50px',
                  padding: '5px 8px',
                  fontSize: '0.775rem',
                  fontWeight: isSelected ? 600 : 500,
                  borderRadius: '6px',
                  border: `1px solid ${isSelected ? 'var(--accent, #0066ff)' : 'var(--border-default, #e2e8f0)'}`,
                  background: isSelected ? 'var(--accent-subtle, #eff6ff)' : 'var(--bg-app, #ffffff)',
                  color: isSelected ? 'var(--accent, #0066ff)' : 'var(--fg-default)',
                  cursor: isTransferring ? 'not-allowed' : 'pointer'
                }}
                aria-checked={isSelected}
                role="radio"
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default VaultSettings;
