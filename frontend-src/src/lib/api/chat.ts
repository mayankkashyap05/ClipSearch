import { apiRequest } from './client';
import type { ChatResponse } from './types';

export function askVideoQuestion(
  videoId: string,
  question: string,
  signal?: AbortSignal,
): Promise<ChatResponse> {
  const params = new URLSearchParams({ video_id: videoId, question });
  return apiRequest<ChatResponse>(`/chat?${params.toString()}`, { signal });
}
