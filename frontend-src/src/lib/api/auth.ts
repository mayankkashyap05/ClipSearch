import { apiRequest } from './client';
import type { AuthResponse } from './types';

export function login(email: string, password: string, signal?: AbortSignal): Promise<AuthResponse> {
  return apiRequest<AuthResponse>('/auth/login', {
    method: 'POST',
    authenticated: false,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    signal,
  });
}

export function signup(email: string, password: string, signal?: AbortSignal): Promise<AuthResponse> {
  return apiRequest<AuthResponse>('/auth/signup', {
    method: 'POST',
    authenticated: false,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    signal,
  });
}
