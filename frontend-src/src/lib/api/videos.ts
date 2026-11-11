import { apiRequest } from './client';
import type { UploadResponse, VideoListResponse } from './types';

export function listVideos(signal?: AbortSignal): Promise<VideoListResponse> {
  return apiRequest<VideoListResponse>('/videos', { signal });
}

export function uploadVideo(file: File, signal?: AbortSignal): Promise<UploadResponse> {
  const form = new FormData();
  form.append('file', file);
  // Do not set Content-Type: the browser supplies the multipart boundary.
  return apiRequest<UploadResponse>('/videos', {
    method: 'POST',
    body: form,
    signal,
  });
}

export function importVideoFromUrl(url: string, signal?: AbortSignal): Promise<UploadResponse> {
  const query = new URLSearchParams({ url });
  return apiRequest<UploadResponse>(`/videos/from-url?${query.toString()}`, {
    method: 'POST',
    signal,
  });
}
