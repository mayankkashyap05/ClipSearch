import { AlertCircle, RefreshCw } from 'lucide-react';

export function ErrorNotice({ message, onRetry, compact = false }: {
  message: string;
  onRetry?: () => void;
  compact?: boolean;
}) {
  return (
    <div className={`error-notice${compact ? ' error-notice--compact' : ''}`} role="alert">
      <AlertCircle size={16} aria-hidden="true" />
      <span>{message}</span>
      {onRetry && (
        <button className="text-button error-notice__retry" type="button" onClick={onRetry}>
          <RefreshCw size={14} aria-hidden="true" /> Try again
        </button>
      )}
    </div>
  );
}

const SKELETON_KEYS = ['skeleton-one', 'skeleton-two', 'skeleton-three', 'skeleton-four', 'skeleton-five'];

export function SkeletonRows({ count = 3 }: { count?: number }) {
  return (
    <div className="skeleton-list" aria-label="Loading videos" role="status">
      <span className="sr-only">Loading videos</span>
      {SKELETON_KEYS.slice(0, Math.min(count, SKELETON_KEYS.length)).map((key) => (
        <div className="skeleton-row" key={key}>
          <span className="skeleton-block skeleton-block--icon" />
          <span className="skeleton-row__text">
            <span className="skeleton-block skeleton-block--title" />
            <span className="skeleton-block skeleton-block--subtitle" />
          </span>
        </div>
      ))}
    </div>
  );
}
