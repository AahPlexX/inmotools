import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveShortenedUrl } from '../../src/tools/site-intel/shortener-resolver';

describe('resolveShortenedUrl (Feature 6 continued)', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('reports the resolved final URL when the response discloses one', async () => {
    vi.mocked(fetch).mockResolvedValue({ url: 'https://destination.example/page' } as Response);
    const result = await resolveShortenedUrl('https://bit.ly/abc123');
    expect(result.resolved).toBe(true);
    expect(result.finalUrl).toBe('https://destination.example/page');
  });

  it('degrades gracefully when the response does not disclose a different URL', async () => {
    vi.mocked(fetch).mockResolvedValue({ url: 'https://bit.ly/abc123' } as Response);
    const result = await resolveShortenedUrl('https://bit.ly/abc123');
    expect(result.resolved).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('degrades gracefully with an honest explanation when fetch is blocked (typical CORS case)', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'));
    const result = await resolveShortenedUrl('https://bit.ly/abc123');
    expect(result.resolved).toBe(false);
    expect(result.error).toMatch(/cross-origin/i);
  });
});
