import { apiRequest, getApiBase } from './client';
import type { PlaybackTokenResponse } from './types';

export function getPlaybackToken(
  videoId: string,
  signal?: AbortSignal,
): Promise<PlaybackTokenResponse> {
  return apiRequest<PlaybackTokenResponse>(
    `/videos/${encodeURIComponent(videoId)}/playback-token`,
    { signal },
  );
}

export function resolveStreamUrl(streamUrl: string): string {
  const base = getApiBase() || window.location.origin;
  const root = `${base.replace(/\/+$/, '')}/`;
  // The API returns a URL that already contains its video-bound token. Keep
  // the query intact; only resolve a relative path against the configured API.
  const absolute = /^(?:[a-z][a-z\d+.-]*:)?\/\//i.test(streamUrl);
  return new URL(absolute ? streamUrl : streamUrl.replace(/^\/+/, ''), root).toString();
}
