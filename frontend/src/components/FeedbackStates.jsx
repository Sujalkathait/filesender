import React from 'react';
import { AlertTriangle, RefreshCw, Info, CheckCircle2, Shield, Lock } from 'lucide-react';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from './ui/empty';
import { Button } from './ui/button';
import { Progress } from './ui/progress';

/**
 * Clean Empty State with Action Button
 */
export function EmptyState({ icon: Icon = Info, title, description, actionText, onAction }) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia>
          <Icon size={24} />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {description && <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
      {actionText && onAction && (
        <EmptyContent>
          <Button variant="secondary" onClick={onAction}>
            {actionText}
          </Button>
        </EmptyContent>
      )}
    </Empty>
  );
}

/**
 * Error Alert with Retry Action
 */
export function ErrorAlert({ message, onRetry, actionText = 'Retry', onAction }) {
  if (!message) return null;
  const handler = onAction || onRetry;

  return (
    <div className="status-message error animate-in" role="alert">
      <AlertTriangle size={18} style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0, whiteSpace: 'pre-wrap' }}>{message}</div>
      {handler && (
        <button
          className="btn btn-secondary btn-sm"
          onClick={handler}
          title={actionText}
          aria-label={actionText}
          style={{ flexShrink: 0 }}
        >
          {actionText === 'Retry' && <RefreshCw size={13} />}
          {actionText}
        </button>
      )}
    </div>
  );
}

/**
 * Measurable Progress Bar with Stage Label, Speed & Percentage
 */
export function MeasurableProgressBar({ stage = 'Processing', percent = 0, statusMessage = '' }) {
  const clampedPercent = Math.min(100, Math.max(0, Math.round(percent)));

  return (
    <div
      className="w-full flex flex-col gap-2"
      role="progressbar"
      aria-valuenow={clampedPercent}
      aria-valuemin="0"
      aria-valuemax="100"
      aria-label={statusMessage || `${stage}... ${clampedPercent}%`}
    >
      <Progress value={clampedPercent} className="h-2" />
      <div className="flex justify-between text-xs text-muted-foreground mt-1">
        <span>{statusMessage || `${stage}...`}</span>
        <span>{clampedPercent}%</span>
      </div>
    </div>
  );
}
