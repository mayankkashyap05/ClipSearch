export type VideoStatus = 'pending' | 'processing' | 'completed' | 'failed' | string;

export interface VideoItem {
  video_id: string;
  filename: string;
  created_at: string | null;
  job_id: string | null;
  status: VideoStatus | null;
  current_stage: string | null;
  summary: string | null;
}

export interface VideoListResponse {
  videos: VideoItem[];
  count: number;
}

export interface AuthResponse {
  access_token: string;
  token_type?: string;
  user_id?: string;
  email?: string;
}

export interface UploadResponse {
  video_id: string;
  job_id: string;
  status: VideoStatus;
}

export interface JobStatusResponse {
  job_id: string;
  video_id: string;
  status: VideoStatus;
  current_stage: string | null;
  error_message: string | null;
  summary: string | null;
  chapters: unknown;
}

export interface Chapter {
  start: number;
  title: string;
}

export interface SearchHit {
  text: string;
  timestamp: number;
  type: string;
  video_id: string;
  owner_id?: string;
  score?: number;
  rerank_score?: number;
}

export interface SearchResponse {
  query: string;
  results: SearchHit[];
}

export interface ChatSource {
  timestamp: number;
  type: string;
  text: string;
}

export interface ChatResponse {
  answer: string;
  sources: ChatSource[];
}

export interface PlaybackTokenResponse {
  video_id: string;
  token: string;
  expires_in: number;
  stream_url: string;
  content_type: string;
}
