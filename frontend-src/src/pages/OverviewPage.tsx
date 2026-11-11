import { ArrowRight, Link2, Upload } from 'lucide-react';
import { Link, useOutletContext } from 'react-router-dom';
import { EmptyState } from '../components/EmptyState';
import { ErrorNotice, SkeletonRows } from '../components/Feedback';
import { VideoRow } from '../components/VideoRow';
import { useVideoLibrary } from '../app/VideoLibraryContext';
import type { VideoItem } from '../lib/api/types';
import { isInProgress } from '../lib/format';

interface ShellContext { openIngest: (mode?: 'file' | 'url') => void }

function VideoSection({ title, videos, countLabel }: { title: string; videos: VideoItem[]; countLabel?: string }) {
  if (!videos.length) return null;
  return (
    <section className="content-section">
      <div className="section-heading">
        <h2>{title}</h2>
        {countLabel && <span className="section-heading__meta">{countLabel}</span>}
      </div>
      <div className="video-list">
        {videos.map((video) => <VideoRow key={video.video_id} video={video} />)}
      </div>
    </section>
  );
}

export function OverviewPage() {
  const { videos, loading, error, refresh } = useVideoLibrary();
  const { openIngest } = useOutletContext<ShellContext>();
  const active = videos.filter((video) => isInProgress(video.status));
  const failed = videos.filter((video) => video.status === 'failed');
  const recent = videos.slice(0, 6);

  return (
    <div className="page-stack">
      <header className="page-heading page-heading--actions">
        <div>
          <h1>Your video library</h1>
          <p>Search, explore and understand the content inside your videos.</p>
        </div>
        <div className="page-heading__actions">
          <button className="button button--secondary" type="button" onClick={() => openIngest('url')}>
            <Link2 size={16} aria-hidden="true" /> Import from URL
          </button>
          <button className="button button--primary" type="button" onClick={() => openIngest('file')}>
            <Upload size={16} aria-hidden="true" /> Upload video
          </button>
        </div>
      </header>

      {error && <ErrorNotice message={error} onRetry={() => void refresh()} />}

      {loading ? (
        <section className="content-section">
          <div className="section-heading"><h2>Recently added</h2></div>
          <SkeletonRows />
        </section>
      ) : error && videos.length === 0 ? null : videos.length === 0 ? (
        <EmptyState
          title="Your library is ready for its first video"
          action={(
            <div className="empty-state__buttons">
              <button className="button button--primary" type="button" onClick={() => openIngest('file')}><Upload size={16} aria-hidden="true" /> Upload a video</button>
              <button className="button button--secondary" type="button" onClick={() => openIngest('url')}><Link2 size={16} aria-hidden="true" /> Import from URL</button>
            </div>
          )}
        >
          Add a recording or import a video link. Once it is processed, you can search its transcript and visual content.
        </EmptyState>
      ) : (
        <>
          {active.length > 0 && <VideoSection title="Processing" videos={active} countLabel={`${active.length} ${active.length === 1 ? 'video' : 'videos'}`} />}
          {failed.length > 0 && <VideoSection title="Needs attention" videos={failed} />}
          <section className="content-section">
            <div className="section-heading">
              <div className="section-heading__title-group">
                <h2>Recently added</h2>
                <span className="section-heading__meta">{videos.length} {videos.length === 1 ? 'video' : 'videos'}</span>
              </div>
              <Link className="text-link" to="/app/library">View library <ArrowRight size={14} aria-hidden="true" /></Link>
            </div>
            <div className="video-list">
              {recent.map((video) => <VideoRow key={video.video_id} video={video} />)}
            </div>
            {videos.length > recent.length && <Link className="section-footer-link" to="/app/library">View all {videos.length} videos <ArrowRight size={14} aria-hidden="true" /></Link>}
          </section>
        </>
      )}
    </div>
  );
}
