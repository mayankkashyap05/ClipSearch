import { Play } from 'lucide-react';

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`brand-mark${compact ? ' brand-mark--compact' : ''}`} aria-hidden="true">
      <Play size={15} strokeWidth={2.3} fill="currentColor" />
    </span>
  );
}
