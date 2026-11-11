import { FileVideo2 } from 'lucide-react';
import type { ReactNode } from 'react';

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-state__icon"><FileVideo2 size={21} strokeWidth={1.6} aria-hidden="true" /></span>
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {action && <div className="empty-state__action">{action}</div>}
    </div>
  );
}
