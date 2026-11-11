import { AlertCircle, Check, CircleDashed, LoaderCircle } from 'lucide-react';
import type { VideoStatus } from '../lib/api/types';
import { getStageLabel } from '../lib/format';

export function StatusBadge({ status, stage, showStage = false }: {
  status: VideoStatus | null | undefined;
  stage?: string | null;
  showStage?: boolean;
}) {
  const normalized = status || 'unknown';
  const label = normalized === 'pending' ? 'Queued'
    : normalized === 'processing' ? 'Processing'
      : normalized === 'completed' ? 'Ready'
        : normalized === 'failed' ? 'Failed'
          : 'Status unavailable';
  const Icon = normalized === 'completed' ? Check
    : normalized === 'failed' ? AlertCircle
      : normalized === 'processing' ? LoaderCircle
        : CircleDashed;
  const stageLabel = normalized === 'processing' ? getStageLabel(stage) : null;

  return (
    <span className={`status-wrap status-wrap--${normalized}`}>
      <span className={`status-badge status-badge--${normalized}`}>
        <Icon size={13} aria-hidden="true" className={normalized === 'processing' ? 'icon-spin' : undefined} />
        {label}
      </span>
      {showStage && stageLabel && <span className="status-stage">{stageLabel}</span>}
    </span>
  );
}
