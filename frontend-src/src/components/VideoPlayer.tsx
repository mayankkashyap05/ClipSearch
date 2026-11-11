import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import {
  Maximize,
  Minimize,
  Pause,
  Play,
  RotateCcw,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { getPlaybackToken, resolveStreamUrl } from '../lib/api/playback';
import type { VideoStatus } from '../lib/api/types';
import { formatTimestamp, getStageLabel } from '../lib/format';

export interface VideoPlayerHandle {
  seekTo: (seconds: number, autoplay?: boolean) => void;
}

interface Props {
  videoId: string;
  filename: string;
  status: VideoStatus | null;
  currentStage: string | null;
  initialSeek?: number | null;
  autoplayInitialSeek?: boolean;
}

export const VideoPlayer = forwardRef<VideoPlayerHandle, Props>(function VideoPlayer({
  videoId,
  filename,
  status,
  currentStage,
  initialSeek = null,
  autoplayInitialSeek = false,
}, ref) {
  const frameRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const pendingSeek = useRef<number | null>(
    typeof initialSeek === 'number' && Number.isFinite(initialSeek) && initialSeek >= 0 ? initialSeek : null,
  );
  const autoplayPending = useRef(Boolean(autoplayInitialSeek && initialSeek !== null));
  const failuresSincePlay = useRef(0);
  const requestSequence = useRef(0);
  const playbackController = useRef<AbortController | null>(null);
  const refreshTimer = useRef<number | null>(null);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyPendingSeek = useCallback((element: HTMLVideoElement) => {
    if (pendingSeek.current !== null) {
      const mediaDuration = Number.isFinite(element.duration) ? element.duration : 0;
      const target = mediaDuration > 0 ? Math.min(pendingSeek.current, mediaDuration) : pendingSeek.current;
      try {
        element.currentTime = target;
        setCurrentTime(target);
      } catch {
        // The browser can reject seeks before media metadata is fully available.
      }
      pendingSeek.current = null;
    }
    if (autoplayPending.current) {
      autoplayPending.current = false;
      void element.play().catch(() => setPlaying(false));
    }
  }, []);

  const requestStream = useCallback(async (preservePosition: boolean, manual = false) => {
    const element = videoRef.current;
    if (preservePosition && element && Number.isFinite(element.currentTime)) {
      if (pendingSeek.current === null) pendingSeek.current = element.currentTime;
      autoplayPending.current = autoplayPending.current || !element.paused;
    }
    if (manual) failuresSincePlay.current = 0;
    const requestId = ++requestSequence.current;
    playbackController.current?.abort();
    const controller = new AbortController();
    playbackController.current = controller;
    setLoading(true);
    setError(null);
    try {
      const playback = await getPlaybackToken(videoId, controller.signal);
      if (requestId !== requestSequence.current) return;
      playbackController.current = null;
      setExpiresAt(Date.now() + Math.max(60, Number(playback.expires_in) || 3600) * 1000);
      setStreamUrl(resolveStreamUrl(playback.stream_url));
      setReady(false);
    } catch (cause) {
      if (requestId !== requestSequence.current) return;
      playbackController.current = null;
      setLoading(false);
      setError(cause instanceof Error ? cause.message : 'The video stream could not be opened.');
    }
  }, [videoId]);

  useEffect(() => {
    void requestStream(false);
    return () => {
      requestSequence.current += 1;
      playbackController.current?.abort();
      playbackController.current = null;
      if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current);
    };
  }, [requestStream]);

  useEffect(() => {
    if (initialSeek === null || !Number.isFinite(initialSeek) || initialSeek < 0) return;
    pendingSeek.current = initialSeek;
    autoplayPending.current = autoplayInitialSeek;
    const element = videoRef.current;
    if (element && element.readyState >= 1) applyPendingSeek(element);
  }, [initialSeek, autoplayInitialSeek, applyPendingSeek]);

  useEffect(() => {
    if (!expiresAt) return;
    const remaining = Math.max(0, expiresAt - Date.now());
    const safetyMargin = Math.min(60_000, Math.max(5_000, remaining * 0.1));
    const delay = Math.max(1000, remaining - safetyMargin);
    refreshTimer.current = window.setTimeout(() => void requestStream(true), delay);
    return () => {
      if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current);
    };
  }, [expiresAt, requestStream]);

  useEffect(() => {
    if (!error || (status !== 'pending' && status !== 'processing')) return;
    const retry = window.setTimeout(() => void requestStream(true), 5000);
    return () => window.clearTimeout(retry);
  }, [error, status, requestStream]);

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(document.fullscreenElement === frameRef.current);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  useImperativeHandle(ref, () => ({
    seekTo(seconds: number, autoplay = true) {
      if (!Number.isFinite(seconds) || seconds < 0) return;
      const element = videoRef.current;
      if (!element || element.readyState < 1) {
        pendingSeek.current = seconds;
        autoplayPending.current = autoplay;
        return;
      }
      const target = Number.isFinite(element.duration) ? Math.min(seconds, element.duration) : seconds;
      element.currentTime = target;
      setCurrentTime(target);
      if (autoplay) void element.play().catch(() => setPlaying(false));
    },
  }), []);

  function togglePlayback() {
    const element = videoRef.current;
    if (!element) return;
    if (element.paused) {
      void element.play().catch(() => setPlaying(false));
    } else {
      element.pause();
    }
  }

  function handleMediaError() {
    if (!streamUrl) return;
    setLoading(false);
    if (failuresSincePlay.current < 1) {
      failuresSincePlay.current += 1;
      void requestStream(true);
      return;
    }
    setError(status === 'pending' || status === 'processing'
      ? 'This video is still being prepared. The stream will be available once the original file has finished importing.'
      : 'This video could not be played in your browser. Try refreshing the stream or check the original file format.');
  }

  function handleTimeline(value: number) {
    const element = videoRef.current;
    if (!element || !Number.isFinite(value)) return;
    element.currentTime = value;
    setCurrentTime(value);
  }

  function handleVolume(value: number) {
    const element = videoRef.current;
    if (!element) return;
    element.volume = value;
    element.muted = value === 0;
    setVolume(value);
    setMuted(value === 0);
  }

  function toggleMute() {
    const element = videoRef.current;
    if (!element) return;
    const nextMuted = !element.muted;
    element.muted = nextMuted;
    if (!nextMuted && element.volume === 0) {
      element.volume = 0.7;
      setVolume(0.7);
    }
    setMuted(nextMuted);
  }

  async function toggleFullscreen() {
    const frame = frameRef.current;
    if (!frame) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await frame.requestFullscreen();
    } catch {
      setError('Fullscreen is not available in this browser.');
    }
  }

  function handleVideoKeyDown(event: KeyboardEvent<HTMLVideoElement>) {
    const element = videoRef.current;
    if (!element) return;
    if (event.key === ' ' || event.key.toLowerCase() === 'k') {
      event.preventDefault();
      togglePlayback();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      handleTimeline(Math.min(duration || Number.MAX_SAFE_INTEGER, element.currentTime + 5));
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      handleTimeline(Math.max(0, element.currentTime - 5));
    } else if (event.key.toLowerCase() === 'm') {
      event.preventDefault();
      toggleMute();
    } else if (event.key.toLowerCase() === 'f') {
      event.preventDefault();
      void toggleFullscreen();
    }
  }

  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  const statusLabel = status === 'processing' ? getStageLabel(currentStage) : null;

  return (
    <section className="player-shell" ref={frameRef} aria-label={`Video player for ${filename || 'video'}`}>
      <div className="player-frame">
        {/* biome-ignore lint/a11y/useMediaCaption: The existing API exposes transcript excerpts, not a timed caption track. */}
        <video
          ref={videoRef}
          className="video-element"
          src={streamUrl || undefined}
          preload="metadata"
          playsInline
          tabIndex={0}
          aria-label={filename || 'Video'}
          aria-describedby="player-keyboard-help"
          onLoadedMetadata={(event) => {
            const element = event.currentTarget;
            const nextDuration = Number.isFinite(element.duration) ? element.duration : 0;
            setDuration(nextDuration);
            setCurrentTime(element.currentTime || 0);
            setReady(true);
            setLoading(false);
            applyPendingSeek(element);
          }}
          onCanPlay={() => { setReady(true); setLoading(false); failuresSincePlay.current = 0; }}
          onWaiting={() => setLoading(true)}
          onPlaying={() => { setPlaying(true); setLoading(false); setError(null); }}
          onPause={() => setPlaying(false)}
          onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime || 0)}
          onDurationChange={(event) => {
            if (Number.isFinite(event.currentTarget.duration)) setDuration(event.currentTarget.duration);
          }}
          onVolumeChange={(event) => {
            setVolume(event.currentTarget.volume);
            setMuted(event.currentTarget.muted);
          }}
          onError={handleMediaError}
          onKeyDown={handleVideoKeyDown}
        />

        {(!ready || loading || error) && (
          <div className={`player-overlay${error ? ' player-overlay--error' : ''}`}>
            {error ? (
              <div className="player-overlay__message" role="alert">
                <span className="player-overlay__title">Unable to play video</span>
                <span className="player-overlay__copy">{error}</span>
                <button className="button button--secondary button--small" type="button" onClick={() => void requestStream(true, true)}>
                  <RotateCcw size={14} aria-hidden="true" /> Retry stream
                </button>
              </div>
            ) : (
              <div className="player-overlay__message" role="status" aria-live="polite">
                <span className="spinner" aria-hidden="true" />
                <span className="player-overlay__title">{streamUrl ? 'Loading video' : 'Preparing video player'}</span>
                {statusLabel && <span className="player-overlay__copy">{statusLabel}</span>}
              </div>
            )}
          </div>
        )}

        {ready && !error && !playing && (
          <button className="player-center-play" type="button" onClick={togglePlayback} aria-label="Play video">
            <Play size={22} fill="currentColor" aria-hidden="true" />
          </button>
        )}

        <span className="sr-only" id="player-keyboard-help">Keyboard shortcuts: Space or K to play or pause, left and right arrows to seek, M to mute, F for fullscreen.</span>
      </div>

      <fieldset className="player-controls">
        <legend className="sr-only">Video controls</legend>
        <button className="player-control-button" type="button" onClick={togglePlayback} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? <Pause size={17} fill="currentColor" aria-hidden="true" /> : <Play size={17} fill="currentColor" aria-hidden="true" />}
        </button>
        <span className="player-time" aria-live="off">{formatTimestamp(currentTime)} <span aria-hidden="true">/</span> {formatTimestamp(duration)}</span>
        <input
          className="player-timeline"
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={Math.min(currentTime, duration || 0)}
          aria-label="Seek video"
          aria-valuetext={`${formatTimestamp(currentTime)} of ${formatTimestamp(duration)}`}
          onChange={(event) => handleTimeline(Number(event.currentTarget.value))}
          disabled={!duration}
          style={{ '--range-progress': duration ? `${(currentTime / duration) * 100}%` : '0%' } as React.CSSProperties}
        />
        <button className="player-control-button player-volume-button" type="button" onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'}>
          <VolumeIcon size={17} aria-hidden="true" />
        </button>
        <input
          className="player-volume"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={muted ? 0 : volume}
          aria-label="Volume"
          onChange={(event) => handleVolume(Number(event.currentTarget.value))}
          style={{ '--range-progress': `${(muted ? 0 : volume) * 100}%` } as React.CSSProperties}
        />
        <label className="sr-only" htmlFor={`playback-speed-${videoId}`}>Playback speed</label>
        <select
          id={`playback-speed-${videoId}`}
          className="player-speed"
          value={playbackRate}
          aria-label="Playback speed"
          onChange={(event) => {
            const nextRate = Number(event.currentTarget.value);
            setPlaybackRate(nextRate);
            if (videoRef.current) videoRef.current.playbackRate = nextRate;
          }}
        >
          {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => <option key={rate} value={rate}>{rate === 1 ? '1×' : `${rate}×`}</option>)}
        </select>
        <button className="player-control-button" type="button" onClick={() => void toggleFullscreen()} aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}>
          {isFullscreen ? <Minimize size={17} aria-hidden="true" /> : <Maximize size={17} aria-hidden="true" />}
        </button>
      </fieldset>
    </section>
  );
});
