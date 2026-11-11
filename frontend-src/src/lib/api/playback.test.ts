import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveStreamUrl } from './playback';

const storage = new Map<string, string>();

beforeEach(() => {
  storage.clear();
  Object.assign(globalThis, {
    window: {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
      location: { origin: 'https://clipsearch.test' },
    },
  });
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'window');
});

describe('resolveStreamUrl', () => {
  it('resolves a relative server URL without dropping its video-bound token', () => {
    expect(resolveStreamUrl('/videos/video-1/stream?token=playback%2Etoken')).toBe(
      'https://clipsearch.test/videos/video-1/stream?token=playback%2Etoken',
    );
  });

  it('resolves relative stream URLs against the configured API base path', () => {
    storage.set('clipsearch_api_base', 'https://api.clipsearch.test/media-api/');
    expect(resolveStreamUrl('/videos/video-1/stream?token=bound-token')).toBe(
      'https://api.clipsearch.test/media-api/videos/video-1/stream?token=bound-token',
    );
  });

  it('preserves absolute stream URLs returned by the API', () => {
    expect(resolveStreamUrl('https://cdn.clipsearch.test/v/1?token=bound-token')).toBe(
      'https://cdn.clipsearch.test/v/1?token=bound-token',
    );
  });
});
