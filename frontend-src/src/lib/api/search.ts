import { apiRequest } from './client';
import type { SearchResponse } from './types';

export function searchVideos(
  query: string,
  limit = 20,
  videoId?: string,
  signal?: AbortSignal,
): Promise<SearchResponse> {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  if (videoId) params.set('video_id', videoId);
  return apiRequest<SearchResponse>(`/search?${params.toString()}`, { signal });
}
