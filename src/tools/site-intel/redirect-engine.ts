export type ShortUrlResolution =
  | { status: 'resolved'; finalUrl: string; redirected: boolean }
  | { status: 'blocked'; reason: string };

const RESOLVE_TIMEOUT_MS = 8_000;

export async function resolveShortUrl(
  rawUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ShortUrlResolution> {
  let input: URL;
  try {
    input = new URL(rawUrl);
  } catch {
    return { status: 'blocked', reason: 'The short link is not a valid URL.' };
  }

  if (input.protocol !== 'http:' && input.protocol !== 'https:') {
    return { status: 'blocked', reason: 'Only HTTP and HTTPS short links can be resolved.' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RESOLVE_TIMEOUT_MS);
  try {
    const response = await fetchImpl(input.toString(), {
      method: 'HEAD',
      redirect: 'follow',
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    });
    const finalUrl = response.url || input.toString();
    const final = new URL(finalUrl);
    if (final.protocol !== 'http:' && final.protocol !== 'https:') {
      return { status: 'blocked', reason: 'The resolved destination uses an unsupported URL scheme.' };
    }
    return {
      status: 'resolved',
      finalUrl: final.toString(),
      redirected: response.redirected || final.toString() !== input.toString(),
    };
  } catch (error) {
    const detail = error instanceof DOMException && error.name === 'AbortError'
      ? 'The short-link lookup timed out.'
      : 'The shortener did not permit this browser to inspect its redirect with CORS.';
    return {
      status: 'blocked',
      reason: `${detail} No destination was guessed or contacted through a proxy.`,
    };
  } finally {
    clearTimeout(timer);
  }
}
