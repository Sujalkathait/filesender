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
        <div className="w-full rounded-xl border border-neutral-200 bg-white p-4 shadow-sm flex flex-col gap-4 mb-4 dark:border-neutral-800 dark:bg-black">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <Spinner size={22} className="text-neutral-900 dark:text-neutral-100" />
              <div className="flex flex-col">
                <span className="text-base font-medium text-neutral-900 dark:text-neutral-100">Downloading...</span>
                <span className="text-sm text-neutral-500 dark:text-neutral-400">
                  {formatBytes(progress.transferredBytes || 0)} / {formatBytes(progress.totalBytes || fileInfo.original_size)}
                </span>
              </div>
            </div>
            <Button variant="outline" size="sm" className="h-8">Cancel</Button>
          </div>
          <Progress value={progress.percent} className="h-2 bg-neutral-100 dark:bg-neutral-800 [&>div]:bg-neutral-900 dark:[&>div]:bg-neutral-100" />
        </div>
      )}

      {!isBurned && (
        <div className="download-actions">
          <Button
            type="button"
            variant="secondary"
            size="lg"
            onClick={() => onExecuteDownload(false, onPreviewReady)}
            disabled={isDecrypting}
            title="Inspect files in browser without saving to disk"
            aria-label="Preview files in browser"
          >
            {isDecrypting ? <Spinner size={16} className="mr-2" /> : <Eye size={16} className="mr-2" />}
            <span>Preview Files</span>
          </Button>
          <Button
            type="button"
            variant="default"
            size="lg"
            onClick={() => onExecuteDownload(true)}
            disabled={isDecrypting}
            aria-busy={isDecrypting}
            aria-label="Save and download file"
          >
            {isDecrypting ? (
              <>
                <Spinner size={16} className="mr-2" /> Decrypting...
              </>
            ) : (
              <>
                <Download size={16} className="mr-2" /> Save &amp; Download
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
