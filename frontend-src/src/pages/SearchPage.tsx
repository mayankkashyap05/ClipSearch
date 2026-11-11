import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Search as SearchIcon, X } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { EmptyState } from '../components/EmptyState';
import { ErrorNotice, SkeletonRows } from '../components/Feedback';
import { SearchResult } from '../components/SearchResult';
import { useVideoLibrary } from '../app/VideoLibraryContext';
import { searchVideos } from '../lib/api/search';
import type { SearchHit } from '../lib/api/types';

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

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { videos } = useVideoLibrary();
  const inputRef = useRef<HTMLInputElement>(null);
  const queryFromUrl = searchParams.get('q') || '';
  const [draft, setDraft] = useState(queryFromUrl);
  const [activeQuery, setActiveQuery] = useState(queryFromUrl.trim());
  const [results, setResults] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoById = useMemo(() => new Map(videos.map((video) => [video.video_id, video])), [videos]);

  useEffect(() => {
    setDraft(queryFromUrl);
    setActiveQuery(queryFromUrl.trim());
  }, [queryFromUrl]);

  useEffect(() => {
    const focusSearch = () => inputRef.current?.focus({ preventScroll: true });
    focusSearch();
    window.addEventListener('clipsearch:focus-search', focusSearch);
    return () => window.removeEventListener('clipsearch:focus-search', focusSearch);
  }, []);

  useEffect(() => {
    if (!activeQuery) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }
    const controller = new AbortController();
    let current = true;
    setLoading(true);
    setError(null);
    const timer = window.setTimeout(() => {
      void searchVideos(activeQuery, 20, undefined, controller.signal)
        .then((response) => {
          if (current) setResults(normalizeHits(response?.results));
        })
        .catch((cause) => {
          if (current && !controller.signal.aborted) {
            setResults([]);
            setError(cause instanceof Error ? cause.message : 'Search could not be completed.');
          }
        })
        .finally(() => { if (current) setLoading(false); });
    }, 160);
    return () => {
      current = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [activeQuery]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = draft.trim();
    if (!clean) {
      setSearchParams({});
      setActiveQuery('');
      setResults([]);
      setError(null);
      return;
    }
    setSearchParams({ q: clean });
  }

  function openMoment(hit: SearchHit) {
    const params = new URLSearchParams({ t: String(hit.timestamp), autoplay: '1' });
    navigate(`/app/video/${encodeURIComponent(hit.video_id)}?${params.toString()}`);
  }

  return (
    <div className="page-stack">
      <header className="page-heading">
        <h1>Search your videos</h1>
        <p>Find a topic, phrase or moment across your library.</p>
      </header>

      <search className="global-search-landmark">
      <form className="global-search-form" onSubmit={submit}>
        <SearchIcon size={19} aria-hidden="true" />
        <label className="sr-only" htmlFor="global-search">Search across your videos</label>
        <input
          ref={inputRef}
          id="global-search"
          type="search"
          value={draft}
          onChange={(event) => setDraft(event.currentTarget.value)}
          placeholder="Search across your videos…"
          autoComplete="off"
        />
        {draft && <button type="button" className="icon-button global-search-clear" aria-label="Clear search" onClick={() => { setDraft(''); setSearchParams({}); setActiveQuery(''); setResults([]); setError(null); inputRef.current?.focus(); }}><X size={16} aria-hidden="true" /></button>}
        <button className="button button--primary global-search-submit" type="submit">Search <ArrowRight size={15} aria-hidden="true" /></button>
      </form>
      </search>
      <p className="search-helper">Search by meaning, not just exact wording. Select a result to open that moment.</p>

      {error && <ErrorNotice message={error} />}
      {loading ? (
        <section className="content-section search-results-section" aria-label="Search results"><SkeletonRows count={4} /></section>
      ) : activeQuery && !error ? (
        results.length ? (
          <section className="content-section search-results-section" aria-labelledby="search-results-title">
            <div className="section-heading">
              <h2 id="search-results-title">Results</h2>
              <span className="section-heading__meta">{results.length} {results.length === 1 ? 'match' : 'matches'}</span>
            </div>
            <div className="search-results-list">
              {results.map((hit) => (
                <SearchResult key={`${hit.video_id}-${hit.timestamp}-${hit.type}-${hit.text}`} hit={hit} video={videoById.get(hit.video_id)} onOpen={() => openMoment(hit)} />
              ))}
            </div>
          </section>
        ) : (
          <EmptyState title="No matching moments found">Try a different phrase, or wait until processing is complete for videos still being indexed.</EmptyState>
        )
      ) : (
        <EmptyState title="Search inside your video library">Ask a question or enter a phrase to find the moments that matter.</EmptyState>
      )}
    </div>
  );
}
