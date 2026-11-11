const TOKEN_KEY = 'clipsearch_token';
const API_BASE_KEY = 'clipsearch_api_base';
const SESSION_EXPIRED_EVENT = 'clipsearch:session-expired';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function getApiBase(): string {
  if (typeof window === 'undefined') return '';
  return (window.localStorage.getItem(API_BASE_KEY) || '').trim().replace(/\/+$/, '');
}

export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function saveSession(token: string, email: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem('clipsearch_email', email);
}

export function clearSession(): void {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem('clipsearch_email');
}

function endpoint(path: string): string {
  return `${getApiBase()}${path}`;
}

async function responseMessage(response: Response): Promise<string> {
  const fallback = `Request failed (${response.status})`;
  try {
    const body: unknown = await response.json();
    if (body && typeof body === 'object' && 'detail' in body) {
      const detail = (body as { detail?: unknown }).detail;
      if (typeof detail === 'string' && detail.trim()) return detail;
      if (Array.isArray(detail)) {
        const first = detail.find((item) => item && typeof item === 'object' && 'msg' in item);
        if (first && typeof (first as { msg?: unknown }).msg === 'string') {
          return (first as { msg: string }).msg;
        }
      }
    }
  } catch {
    // Keep the response status as a useful, non-sensitive fallback.
  }
  return fallback;
}

interface RequestOptions extends RequestInit {
  authenticated?: boolean;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { authenticated = true, headers: suppliedHeaders, ...init } = options;
  const headers = new Headers(suppliedHeaders);
  const token = authenticated ? getStoredToken() : null;
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(endpoint(path), { ...init, headers });
  if (!response.ok) {
    if (response.status === 401 && authenticated && token) {
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
    throw new ApiError(await responseMessage(response), response.status);
  }
  return (await response.json()) as T;
}

export function sessionExpiredEventName(): string {
  return SESSION_EXPIRED_EVENT;
}

export function apiBaseStorageKey(): string {
  return API_BASE_KEY;
}
