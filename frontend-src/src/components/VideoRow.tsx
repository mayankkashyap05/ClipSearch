import { ArrowUpRight, FileVideo2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { VideoItem } from '../lib/api/types';
import { formatDate, getStageLabel, videoDisplayName } from '../lib/format';
import { StatusBadge } from './StatusBadge';

export function VideoRow({ video, compact = false }: { video: VideoItem; compact?: boolean }) {
  const stage = video.status === 'processing' ? getStageLabel(video.current_stage) : null;
  return (
    <Link className={`video-row${compact ? ' video-row--compact' : ''}`} to={`/app/video/${encodeURIComponent(video.video_id)}`}>
      <span className="video-row__file-icon"><FileVideo2 size={18} strokeWidth={1.7} aria-hidden="true" /></span>
      <span className="video-row__main">
        <span className="video-row__title" title={video.filename || undefined}>{videoDisplayName(video)}</span>
        {!compact && video.summary && <span className="video-row__summary">{video.summary}</span>}
        {!compact && stage && <span className="video-row__mobile-stage">{stage}</span>}
      </span>
      <span className="video-row__status"><StatusBadge status={video.status} stage={video.current_stage} showStage /></span>
      <time className="video-row__date" dateTime={video.created_at || undefined}>{formatDate(video.created_at)}</time>
      <ArrowUpRight className="video-row__open" size={16} aria-hidden="true" />
    </Link>
  );
}
