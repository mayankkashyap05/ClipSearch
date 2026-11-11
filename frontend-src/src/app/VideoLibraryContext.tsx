import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { listVideos } from '../lib/api/videos';
import type { VideoItem } from '../lib/api/types';
import { isInProgress } from '../lib/format';

interface VideoLibraryValue {
  videos: VideoItem[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  upsertVideo: (video: VideoItem) => void;
  updateVideo: (videoId: string, fields: Partial<VideoItem>) => void;
}

const VideoLibraryContext = createContext<VideoLibraryValue | null>(null);

function normalizeVideoList(payload: unknown): VideoItem[] {
  if (!payload || typeof payload !== 'object') return [];
  const items = (payload as { videos?: unknown }).videos;
  if (!Array.isArray(items)) return [];
  return items.flatMap((raw): VideoItem[] => {
    if (!raw || typeof raw !== 'object') return [];
    const item = raw as Partial<VideoItem>;
    if (typeof item.video_id !== 'string' || !item.video_id) return [];
    return [{
      video_id: item.video_id,
      filename: typeof item.filename === 'string' ? item.filename : '',
      created_at: typeof item.created_at === 'string' ? item.created_at : null,
      job_id: typeof item.job_id === 'string' ? item.job_id : null,
      status: typeof item.status === 'string' ? item.status : null,
      current_stage: typeof item.current_stage === 'string' ? item.current_stage : null,
      summary: typeof item.summary === 'string' ? item.summary : null,
    }];
  });
}

export function VideoLibraryProvider({ children }: { children: ReactNode }) {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const activeController = useRef<AbortController | null>(null);
  const requestSequence = useRef(0);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    const requestId = ++requestSequence.current;
    const controller = new AbortController();
    activeController.current = controller;
    setRefreshing(true);
    try {
      const payload = await listVideos(controller.signal);
      if (!mounted.current || requestId !== requestSequence.current) return;
      setVideos(normalizeVideoList(payload));
      setError(null);
    } catch (cause) {
      if (!mounted.current || controller.signal.aborted || requestId !== requestSequence.current) return;
      setError(cause instanceof Error ? cause.message : 'Could not load your videos.');
    } finally {
      if (requestId === requestSequence.current) {
        inFlight.current = false;
        activeController.current = null;
        if (mounted.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }
  }, []);

  const upsertVideo = useCallback((video: VideoItem) => {
    setVideos((current) => {
      const existing = current.findIndex((item) => item.video_id === video.video_id);
      if (existing === -1) return [video, ...current];
      return current.map((item, index) => index === existing ? { ...item, ...video } : item);
    });
  }, []);

  const updateVideo = useCallback((videoId: string, fields: Partial<VideoItem>) => {
    setVideos((current) => current.map((item) => item.video_id === videoId ? { ...item, ...fields } : item));
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      mounted.current = false;
      requestSequence.current += 1;
      inFlight.current = false;
      activeController.current?.abort();
      activeController.current = null;
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  const hasActiveJobs = videos.some((video) => isInProgress(video.status));
  useEffect(() => {
    if (!hasActiveJobs) return;
    const timer = window.setInterval(() => void refresh(), 9000);
    return () => window.clearInterval(timer);
  }, [hasActiveJobs, refresh]);

  const value = useMemo(() => ({
    videos,
    loading,
    refreshing,
    error,
    refresh,
    upsertVideo,
    updateVideo,
  }), [videos, loading, refreshing, error, refresh, upsertVideo, updateVideo]);

  return <VideoLibraryContext.Provider value={value}>{children}</VideoLibraryContext.Provider>;
}

export function useVideoLibrary(): VideoLibraryValue {
  const context = useContext(VideoLibraryContext);
  if (!context) throw new Error('useVideoLibrary must be used inside VideoLibraryProvider');
  return context;
}
