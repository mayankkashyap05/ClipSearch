import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRequest } from './client';
import { login } from './auth';
import { searchVideos } from './search';
import { importVideoFromUrl, uploadVideo } from './videos';

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, String(value)),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  };
}

const storage = createStorage();
const dispatchEvent = vi.fn();

beforeEach(() => {
  storage.clear();
  vi.stubGlobal('window', {
    localStorage: storage,
    location: { origin: 'https://clipsearch.test' },
    dispatchEvent,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  dispatchEvent.mockClear();
});

describe('API client', () => {
  it('uploads a video as FormData without setting multipart Content-Type manually', async () => {
    storage.setItem('clipsearch_token', 'session-token');
    storage.setItem('clipsearch_api_base', 'https://api.clipsearch.test');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ video_id: 'v1', job_id: 'j1', status: 'pending' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    const file = new File(['video bytes'], 'meeting.mp4', { type: 'video/mp4' });

    await uploadVideo(file);

    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.clipsearch.test/videos');
    expect(new Headers(request.headers).get('Authorization')).toBe('Bearer session-token');
    expect(new Headers(request.headers).has('Content-Type')).toBe(false);
    expect((request.body as FormData).get('file')).toBeInstanceOf(File);
    expect(((request.body as FormData).get('file') as File).name).toBe('meeting.mp4');
  });

  it('sends login credentials using the existing JSON endpoint contract', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: 'session-token', email: 'person@example.com' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await login('person@example.com', 'a-password');

    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(url, 'https://clipsearch.test').href).toBe('https://clipsearch.test/auth/login');
    expect(request.method).toBe('POST');
    expect(new Headers(request.headers).get('Content-Type')).toBe('application/json');
    expect(new Headers(request.headers).has('Authorization')).toBe(false);
    expect(JSON.parse(String(request.body))).toEqual({ email: 'person@example.com', password: 'a-password' });
  });

  it('encodes the source URL in the existing import query parameter', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ video_id: 'v1', job_id: 'j1', status: 'pending' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    const sourceUrl = 'https://video.example/watch?v=123&title=Planning';

    await importVideoFromUrl(sourceUrl);

    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    const parsed = new URL(url, 'https://clipsearch.test');
    expect(parsed.pathname).toBe('/videos/from-url');
    expect(parsed.searchParams.get('url')).toBe(sourceUrl);
    expect(request.method).toBe('POST');
    expect(request.body).toBeUndefined();
  });

  it('encodes semantic search parameters and the optional video scope', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ query: 'budget & planning', results: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await searchVideos('budget & planning', 12, 'video-42');

    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    const parsed = new URL(url, 'https://clipsearch.test');
    expect(parsed.pathname).toBe('/search');
    expect(parsed.searchParams.get('q')).toBe('budget & planning');
    expect(parsed.searchParams.get('limit')).toBe('12');
    expect(parsed.searchParams.get('video_id')).toBe('video-42');
    expect(request.method).toBeUndefined();
  });

  it('signals an expired authenticated session on a 401 response', async () => {
    storage.setItem('clipsearch_token', 'expired-session');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: 'Session expired' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiRequest('/videos')).rejects.toMatchObject({ status: 401, message: 'Session expired' });
    expect(dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'clipsearch:session-expired' }));
  });
});
