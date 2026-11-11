import { apiRequest } from './client';
import type { JobStatusResponse } from './types';

export function getJob(jobId: string, signal?: AbortSignal): Promise<JobStatusResponse> {
  return apiRequest<JobStatusResponse>(`/jobs/${encodeURIComponent(jobId)}`, { signal });
}
