/** Small fetch helpers: browser-ish UA, timeout, a couple of retries on 5xx/429. */

export const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export class HttpError extends Error {
  constructor(public status: number, url: string) {
    super(`HTTP ${status} for ${url}`);
  }
}

async function request(url: string, init: RequestInit = {}, timeoutMs = 15_000, retries = 2): Promise<Response> {
  let last: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal, headers: { 'User-Agent': UA, Accept: '*/*', ...init.headers } });
      if (res.ok) return res;
      last = new HttpError(res.status, url);
      // Cloudflare challenges (403) and 4xx won't fix themselves; only retry throttling and server errors.
      if (res.status !== 429 && res.status < 500) break;
    } catch (err) {
      last = err;
    } finally {
      clearTimeout(timer);
    }
    await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
  }
  throw last instanceof Error ? last : new Error(String(last));
}

export async function getJson<T = unknown>(url: string, timeoutMs?: number): Promise<T> {
  const res = await request(url, { headers: { Accept: 'application/json' } }, timeoutMs);
  return (await res.json()) as T;
}

export async function getText(url: string, timeoutMs?: number): Promise<string> {
  const res = await request(url, {}, timeoutMs);
  return res.text();
}

/** Run async work over items with bounded concurrency, keeping order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
