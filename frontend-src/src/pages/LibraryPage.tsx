import { useMemo, useState } from 'react';
import { FileVideo2, Grid2X2, List, RefreshCw, Search, Upload } from 'lucide-react';
import { Link, useOutletContext } from 'react-router-dom';
import { EmptyState } from '../components/EmptyState';
import { ErrorNotice, SkeletonRows } from '../components/Feedback';
import { StatusBadge } from '../components/StatusBadge';
import { VideoRow } from '../components/VideoRow';
import { useVideoLibrary } from '../app/VideoLibraryContext';
import type { VideoItem } from '../lib/api/types';
import { formatDate, isInProgress, videoDisplayName } from '../lib/format';

interface ShellContext { openIngest: (mode?: 'file' | 'url') => void }
type Filter = 'all' | 'processing' | 'completed' | 'failed';
type Sort = 'newest' | 'oldest' | 'name';

function matchesFilter(video: VideoItem, filter: Filter): boolean {
  if (filter === 'all') return true;
  if (filter === 'processing') return isInProgress(video.status);
  return video.status === filter;
}

function VideoGridCard({ video }: { video: VideoItem }) {
  return (
    <Link className="video-card" to={`/app/video/${encodeURIComponent(video.video_id)}`}>
      <div className="video-card__preview" aria-hidden="true"><FileVideo2 size={24} strokeWidth={1.4} /></div>
      <div className="video-card__content">
        <div className="video-card__title-row">
          <h3 title={video.filename || undefined}>{videoDisplayName(video)}</h3>
          <span className="video-card__date">{formatDate(video.created_at)}</span>
        </div>
        {video.summary && <p>{video.summary}</p>}
        <StatusBadge status={video.status} stage={video.current_stage} showStage />
      </div>
    </Link>
  );
}

export function LibraryPage() {
  const { videos, loading, error, refreshing, refresh } = useVideoLibrary();
  const { openIngest } = useOutletContext<ShellContext>();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('newest');
  const [layout, setLayout] = useState<'list' | 'grid'>('list');

  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return videos
      .filter((video) => matchesFilter(video, filter))
      .filter((video) => !term || `${video.filename} ${video.summary || ''}`.toLocaleLowerCase().includes(term))
      .sort((a, b) => {
        if (sort === 'name') return videoDisplayName(a).localeCompare(videoDisplayName(b));
        const timeA = a.created_at ? Date.parse(a.created_at) : 0;
        const timeB = b.created_at ? Date.parse(b.created_at) : 0;
        return sort === 'newest' ? timeB - timeA : timeA - timeB;
      });
  }, [videos, query, filter, sort]);

  return (
    <div className="page-stack">
      <header className="page-heading page-heading--actions">
        <div>
          <h1>Library</h1>
          <p>All your videos, together in one place.</p>
        </div>
        <div className="page-heading__actions">
          <button className="button button--secondary" type="button" onClick={() => void refresh()} disabled={refreshing} aria-label="Refresh library">
            <RefreshCw size={15} className={refreshing ? 'icon-spin' : undefined} aria-hidden="true" /> <span>Refresh</span>
          </button>
          <button className="button button--primary" type="button" onClick={() => openIngest('file')}><Upload size={16} aria-hidden="true" /> Add video</button>
        </div>
      </header>

      {error && <ErrorNotice message={error} onRetry={() => void refresh()} />}

      <div className="library-toolbar">
        <label className="library-search input-with-icon" htmlFor="library-search">
          <Search size={16} aria-hidden="true" />
          <input id="library-search" type="search" value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Find a video by name or summary" />
        </label>
        <div className="library-toolbar__controls">
          <label className="select-wrap">
            <span className="sr-only">Filter videos by status</span>
            <select className="select-input" value={filter} onChange={(event) => setFilter(event.currentTarget.value as Filter)}>
              <option value="all">All statuses</option>
              <option value="processing">Processing</option>
              <option value="completed">Ready</option>
              <option value="failed">Failed</option>
            </select>
          </label>
          <label className="select-wrap">
            <span className="sr-only">Sort videos</span>
            <select className="select-input" value={sort} onChange={(event) => setSort(event.currentTarget.value as Sort)}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="name">Name A–Z</option>
            </select>
          </label>
          <fieldset className="layout-toggle">
            <legend className="sr-only">Library layout</legend>
            <button className={layout === 'list' ? 'is-selected' : ''} type="button" onClick={() => setLayout('list')} aria-label="List view" aria-pressed={layout === 'list'}><List size={16} aria-hidden="true" /></button>
            <button className={layout === 'grid' ? 'is-selected' : ''} type="button" onClick={() => setLayout('grid')} aria-label="Grid view" aria-pressed={layout === 'grid'}><Grid2X2 size={15} aria-hidden="true" /></button>
          </fieldset>
        </div>
      </div>

      <p className="result-count" aria-live="polite">{loading ? 'Loading your library…' : error && videos.length === 0 ? 'Library unavailable' : `${filtered.length} ${filtered.length === 1 ? 'video' : 'videos'}`}</p>

      {loading ? <SkeletonRows count={5} /> : error && videos.length === 0 ? null : videos.length === 0 ? (
        <EmptyState title="No videos yet" action={<button className="button button--primary" type="button" onClick={() => openIngest('file')}><Upload size={16} aria-hidden="true" /> Add your first video</button>}>
          Upload a video or import it from a URL. Processing status and summaries will show here.
        </EmptyState>
      ) : filtered.length === 0 ? (
        <EmptyState title="No videos match this view">Try a different search or status filter.</EmptyState>
      ) : layout === 'list' ? (
        <div className="video-list video-list--library">
          {filtered.map((video) => <VideoRow key={video.video_id} video={video} />)}
        </div>
      ) : (
        <div className="video-grid">
          {filtered.map((video) => <VideoGridCard key={video.video_id} video={video} />)}
        </div>
      )}
    </div>
  );
}
