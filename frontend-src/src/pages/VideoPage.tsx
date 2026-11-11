import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { ArrowLeft, Play, Search as SearchIcon } from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ErrorNotice } from '../components/Feedback';
import { SearchResult } from '../components/SearchResult';
import { StatusBadge } from '../components/StatusBadge';
import { VideoAssistant } from '../components/VideoAssistant';
import { VideoPlayer, type VideoPlayerHandle } from '../components/VideoPlayer';
import { useVideoLibrary } from '../app/VideoLibraryContext';
import { useJobDetails } from '../hooks/useJobDetails';
import { searchVideos } from '../lib/api/search';
import type { SearchHit, VideoItem, VideoStatus } from '../lib/api/types';
import { formatDate, formatTimestamp, getStageLabel, parseChapters, videoDisplayName } from '../lib/format';

function normalizeHits(value: unknown): SearchHit[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): SearchHit[] => {
    if (!entry || typeof entry !== 'object') return [];
    const raw = entry as Partial<SearchHit>;
    const timestamp = Number(raw.timestamp);
    if (typeof raw.video_id !== 'string' || !raw.video_id || !Number.isFinite(timestamp)) return [];
    return [{
      text: typeof raw.text === 'string' ? raw.text : '',
      timestamp: Math.max(0, timestamp),
      type: typeof raw.type === 'string' ? raw.type : 'source',
      video_id: raw.video_id,
    }];
  });
}

function VideoSearch({ video, onSeek }: { video: VideoItem; onSeek: (timestamp: number) => void }) {
  const videoId = video.video_id;
  const [draft, setDraft] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeQuery) return;
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);
    void searchVideos(activeQuery, 10, videoId, controller.signal)
      .then((response) => { if (active) setHits(normalizeHits(response?.results).filter((hit) => hit.video_id === videoId)); })
      .catch((cause) => {
        if (active && !controller.signal.aborted) {
          setHits([]);
          setError(cause instanceof Error ? cause.message : 'Search in this video could not be completed.');
        }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [activeQuery, videoId]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = draft.trim();
    if (clean) setActiveQuery(clean);
  }

  return (
    <div className="video-search-panel">
      <search className="video-search-landmark">
      <form className="video-search-form" onSubmit={submit}>
        <SearchIcon size={16} aria-hidden="true" />
        <label className="sr-only" htmlFor="search-this-video">Search inside this video</label>
        <input id="search-this-video" type="search" value={draft} onChange={(event) => setDraft(event.currentTarget.value)} placeholder="Find a moment in this video…" />
        <button className="button button--secondary button--small" type="submit" disabled={!draft.trim()}>Search</button>
      </form>
      </search>
      <p className="search-helper">Search this video’s transcript and visual descriptions.</p>
      {error && <ErrorNotice message={error} compact />}
      {loading && <p className="inline-loading" role="status"><span className="spinner" aria-hidden="true" /> Searching this video…</p>}
      {!loading && activeQuery && !error && hits.length === 0 && <p className="panel-empty">No moments found for “{activeQuery}”.</p>}
      {!loading && hits.length > 0 && (
        <div className="search-results-list video-search-results">
          {hits.map((hit) => (
            <SearchResult key={`${hit.video_id}-${hit.timestamp}-${hit.type}-${hit.text}`} hit={hit} video={video} onOpen={() => onSeek(hit.timestamp)} />
          ))}
        </div>
      )}
      {!activeQuery && <p className="panel-empty">Search for a phrase or topic to jump to relevant moments.</p>}
    </div>
  );
}

export function VideoPage() {
  const { videoId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const playerRef = useRef<VideoPlayerHandle>(null);
  const [activeTab, setActiveTab] = useState<'summary' | 'chapters' | 'moments'>('summary');
  const { videos, loading: libraryLoading, error: libraryError, refresh: refreshLibrary } = useVideoLibrary();
  const video = useMemo(() => videos.find((item) => item.video_id === videoId), [videos, videoId]);
  const { job, error: jobError, loading: jobLoading, retry: retryJob } = useJobDetails(video);
  const status: VideoStatus | null = job?.status ?? video?.status ?? null;
  const currentStage = job?.current_stage ?? video?.current_stage ?? null;
  const summary = job?.summary || video?.summary || '';
  const chapters = parseChapters(job?.chapters);
  const requestedTime = searchParams.get('t');
  const initialSeekValue = requestedTime === null ? null : Number(requestedTime);
  const initialSeek = initialSeekValue !== null && Number.isFinite(initialSeekValue) && initialSeekValue >= 0 ? initialSeekValue : null;
  const autoplayInitialSeek = searchParams.get('autoplay') === '1';
  const name = videoDisplayName(video, videoId);
  const stageLabel = status === 'processing' ? getStageLabel(currentStage) : null;
  const tabs = ['summary', 'chapters', 'moments'] as const;

  function handleTabKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const currentIndex = tabs.indexOf(activeTab);
    const nextIndex = (currentIndex + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
    const nextTab = tabs[nextIndex];
    setActiveTab(nextTab);
    event.currentTarget.querySelector<HTMLButtonElement>(`[data-tab="${nextTab}"]`)?.focus();
  }

  if (!video && libraryLoading) {
    return <div className="page-stack page-stack--narrow"><div className="skeleton-block skeleton-block--title" /><div className="video-loading-block" /></div>;
  }

  if (!video && libraryError) {
    return (
      <div className="page-stack page-stack--narrow">
        <Link className="back-link" to="/app/library"><ArrowLeft size={15} aria-hidden="true" /> Back to library</Link>
        <ErrorNotice message={libraryError} onRetry={() => void refreshLibrary()} />
      </div>
    );
  }

  if (!video) {
    return (
      <div className="page-stack page-stack--narrow">
        <Link className="back-link" to="/app/library"><ArrowLeft size={15} aria-hidden="true" /> Back to library</Link>
        <div className="not-found-state">
          <h1>Video not found</h1>
          <p>This video may have been removed or may not belong to this account.</p>
          <Link className="button button--secondary" to="/app/library">Open library</Link>
        </div>
      </div>
    );
  }

  const fileLabel = name;

  return (
    <div className="page-stack video-page">
      <header className="video-page-heading">
        <Link className="back-link" to="/app/library"><ArrowLeft size={15} aria-hidden="true" /> Library</Link>
        <div className="video-page-heading__title-row">
          <h1 title={video.filename || undefined}>{fileLabel}</h1>
          <span role="status" aria-live="polite"><StatusBadge status={status} stage={currentStage} /></span>
        </div>
        <p className="video-page-heading__meta">
          {video.created_at ? `Added ${formatDate(video.created_at)}` : 'Video workspace'}
          {jobLoading && <span className="job-refreshing"><span className="spinner" aria-hidden="true" /> Updating status</span>}
        </p>
      </header>

      {jobError && <ErrorNotice message={`Processing status: ${jobError}`} onRetry={retryJob} compact />}
      {status === 'failed' && <ErrorNotice message={job?.error_message || 'Processing could not be completed. The original video may still be available.'} compact />}

      <div className="workspace-grid">
        <div className="workspace-main">
          <VideoPlayer
            ref={playerRef}
            key={video.video_id}
            videoId={video.video_id}
            filename={video.filename}
            status={status}
            currentStage={currentStage}
            initialSeek={initialSeek}
            autoplayInitialSeek={autoplayInitialSeek}
          />

          <section className="video-details" aria-label="Video details">
            <div className="video-tabs" role="tablist" aria-label="Video information" onKeyDown={handleTabKeyDown}>
              <button id="tab-summary" data-tab="summary" role="tab" tabIndex={activeTab === 'summary' ? 0 : -1} aria-selected={activeTab === 'summary'} aria-controls="panel-summary" className={activeTab === 'summary' ? 'is-active' : ''} type="button" onClick={() => setActiveTab('summary')}>Summary</button>
              <button id="tab-chapters" data-tab="chapters" role="tab" tabIndex={activeTab === 'chapters' ? 0 : -1} aria-selected={activeTab === 'chapters'} aria-controls="panel-chapters" className={activeTab === 'chapters' ? 'is-active' : ''} type="button" onClick={() => setActiveTab('chapters')}>Chapters{chapters.length ? <span className="tab-count">{chapters.length}</span> : null}</button>
              <button id="tab-moments" data-tab="moments" role="tab" tabIndex={activeTab === 'moments' ? 0 : -1} aria-selected={activeTab === 'moments'} aria-controls="panel-moments" className={activeTab === 'moments' ? 'is-active' : ''} type="button" onClick={() => setActiveTab('moments')}>Find moments</button>
            </div>

            {/* biome-ignore lint/a11y/noNoninteractiveTabindex: Text-only tab panels need a keyboard stop for screen-reader users. */}
            <div id="panel-summary" role="tabpanel" tabIndex={0} hidden={activeTab !== 'summary'} aria-labelledby="tab-summary" className="video-tab-panel">
              {summary ? <p className="video-summary">{summary}</p> : status === 'failed' ? (
                <p className="panel-empty">A summary is not available because processing did not finish.</p>
              ) : (
                <p className="panel-empty">{status === 'completed' ? 'No summary was returned for this video.' : 'The summary will appear here when processing is complete.'}</p>
              )}
            </div>

            {/* biome-ignore lint/a11y/noNoninteractiveTabindex: Text-only tab panels need a keyboard stop when screen-reader users select an empty chapter list. */}
            <div id="panel-chapters" role="tabpanel" tabIndex={0} hidden={activeTab !== 'chapters'} aria-labelledby="tab-chapters" className="video-tab-panel">
              {chapters.length ? (
                <ol className="chapter-list">
                  {chapters.map((chapter) => (
                    <li key={`${chapter.start}-${chapter.title}`}>
                      <button className="chapter-row" type="button" onClick={() => playerRef.current?.seekTo(chapter.start, true)}>
                        <span className="chapter-row__time">{formatTimestamp(chapter.start)}</span>
                        <span className="chapter-row__title">{chapter.title}</span>
                        <span className="chapter-row__play" aria-hidden="true"><Play size={14} fill="currentColor" /></span>
                      </button>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="panel-empty">{status === 'failed' ? 'Chapters are not available for this video.' : 'Chapters will appear here when processing is complete.'}</p>
              )}
            </div>

            {/* biome-ignore lint/a11y/noNoninteractiveTabindex: The tab panel is the keyboard destination while video search is unavailable. */}
            <div id="panel-moments" role="tabpanel" tabIndex={0} hidden={activeTab !== 'moments'} aria-labelledby="tab-moments" className="video-tab-panel">
              {status === 'completed' ? <VideoSearch video={video} onSeek={(timestamp) => playerRef.current?.seekTo(timestamp, true)} /> : (
                <p className="panel-empty">Search within this video when processing and indexing are complete.</p>
              )}
            </div>
          </section>
          {stageLabel && status === 'processing' && <p className="processing-caption" role="status" aria-live="polite"><span className="spinner" aria-hidden="true" />{stageLabel}. Search, summaries and chapters will be available when processing is complete.</p>}
        </div>

        <VideoAssistant
          videoId={video.video_id}
          status={status}
          onSeek={(timestamp, autoplay = true) => playerRef.current?.seekTo(timestamp, autoplay)}
        />
      </div>
    </div>
  );
}
