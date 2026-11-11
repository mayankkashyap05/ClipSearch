import { useCallback, useEffect, useState } from 'react';
import { getJob } from '../lib/api/jobs';
import type { JobStatusResponse, VideoItem } from '../lib/api/types';
import { useVideoLibrary } from '../app/VideoLibraryContext';
import { isInProgress } from '../lib/format';

function normalizeJob(payload: unknown, jobId: string, videoId: string): JobStatusResponse {
  const raw = payload && typeof payload === 'object' ? payload as Partial<JobStatusResponse> : {};
  return {
    job_id: typeof raw.job_id === 'string' ? raw.job_id : jobId,
    video_id: typeof raw.video_id === 'string' ? raw.video_id : videoId,
    status: typeof raw.status === 'string' ? raw.status : 'unknown',
    current_stage: typeof raw.current_stage === 'string' ? raw.current_stage : null,
    error_message: typeof raw.error_message === 'string' ? raw.error_message : null,
    summary: typeof raw.summary === 'string' ? raw.summary : null,
    chapters: raw.chapters ?? null,
  };
}

export function useJobDetails(video: VideoItem | undefined) {
  const { updateVideo } = useVideoLibrary();
  const videoId = video?.video_id || '';
  const jobId = video?.job_id || '';
  const [jobState, setJobState] = useState<{ videoId: string; data: JobStatusResponse } | null>(null);
  const [errorState, setErrorState] = useState<{ videoId: string; message: string } | null>(null);
  const [loadingVideoId, setLoadingVideoId] = useState('');
  const [retryVersion, setRetryVersion] = useState(0);
  const job = jobState?.videoId === videoId ? jobState.data : null;
  const error = errorState?.videoId === videoId ? errorState.message : null;
  const loading = Boolean(videoId && jobId && loadingVideoId === videoId && !job);

  useEffect(() => {
    if (!videoId || !jobId) return;
    let cancelled = false;
    let timer: number | null = null;
    let controller: AbortController | null = null;
    setLoadingVideoId(videoId);
    if (retryVersion > 0) setErrorState(null);

    const poll = async () => {
      controller = new AbortController();
      try {
        const response = await getJob(jobId, controller.signal);
        if (cancelled) return;
        const data = normalizeJob(response, jobId, videoId);
        setJobState({ videoId, data });
        setErrorState(null);
        updateVideo(videoId, {
          status: data.status,
          current_stage: data.current_stage,
          summary: data.summary,
        });
        if (isInProgress(data.status)) timer = window.setTimeout(() => void poll(), 3000);
      } catch (cause) {
        if (cancelled || controller?.signal.aborted) return;
        setErrorState({
          videoId,
          message: cause instanceof Error ? cause.message : 'Processing status could not be refreshed.',
        });
        timer = window.setTimeout(() => void poll(), 5000);
      } finally {
        if (!cancelled) setLoadingVideoId('');
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
      controller?.abort();
    };
  }, [videoId, jobId, updateVideo, retryVersion]);

  const retry = useCallback(() => setRetryVersion((version) => version + 1), []);
  return { job, error, loading, retry };
}
