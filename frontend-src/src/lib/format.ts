import type { Chapter, VideoItem } from './api/types';

export function formatTimestamp(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '0:00';
  const total = Math.floor(value);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
  }).format(date);
}

export function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '';
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function getStageLabel(stage: string | null | undefined): string | null {
  if (!stage) return null;
  const labels: Record<string, string> = {
    downloading: 'Preparing video',
    preprocessing: 'Extracting audio and video',
    transcribing: 'Transcribing speech',
    diarizing: 'Separating speakers',
    captioning: 'Analyzing visual content',
    summarizing: 'Generating summary',
    indexing: 'Making video searchable',
    done: 'Ready to explore',
  };
  return labels[stage] || 'Processing video';
}

export function isInProgress(status: VideoItem['status']): boolean {
  return status === 'pending' || status === 'processing';
}

export function parseChapters(value: unknown): Chapter[] {
  let parsed = value;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed) as unknown;
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((entry): Chapter[] => {
    if (!entry || typeof entry !== 'object') return [];
    const raw = entry as { start?: unknown; title?: unknown };
    if (raw.start === null || raw.start === undefined || (typeof raw.start === 'string' && !raw.start.trim())) return [];
    const start = typeof raw.start === 'number' ? raw.start : typeof raw.start === 'string' ? Number(raw.start) : Number.NaN;
    const title = typeof raw.title === 'string' ? raw.title.trim() : '';
    if (!Number.isFinite(start) || start < 0 || !title) return [];
    return [{ start, title }];
  }).sort((a, b) => a.start - b.start);
}

export function videoDisplayName(video: VideoItem | undefined, fallbackId?: string): string {
  const name = video?.filename?.trim();
  if (name) return name;
  return fallbackId ? `Video ${fallbackId.slice(0, 8)}` : 'Untitled video';
}

export function getInitials(email: string): string {
  const first = email.trim().charAt(0);
  return first ? first.toUpperCase() : 'C';
}
