import { getJson, errMsg } from '../http.js';
import type { ChanThread, SourceStatus } from '../types.js';

/**
 * 4chan's read-only JSON API (a.4cdn.org). One catalog request per board; the
 * API asks for at most one request per second, so boards are fetched in series.
 * Work-safe boards only.
 */
export const BOARDS = ['biz', 'pol', 'g', 'tv', 'v', 'co', 'int', 'x'];

interface CatalogThread {
  no: number;
  sub?: string;
  com?: string;
  replies?: number;
  images?: number;
  time: number; // seconds
  sticky?: number;
}

export function cleanHtml(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function fetchChan(status: SourceStatus[], now = Date.now()): Promise<ChanThread[]> {
  const out: ChanThread[] = [];
  let ok = 0;
  let lastErr = '';
  for (const board of BOARDS) {
    try {
      const pages = await getJson<{ threads: CatalogThread[] }[]>(`https://a.4cdn.org/${board}/catalog.json`);
      for (const t of pages.flatMap((p) => p.threads)) {
        if (t.sticky) continue;
        const ageH = Math.max(0.25, (now - t.time * 1000) / 3_600_000);
        out.push({
          board,
          no: t.no,
          subject: cleanHtml(t.sub ?? ''),
          excerpt: cleanHtml(t.com ?? '').slice(0, 280),
          replies: t.replies ?? 0,
          images: t.images ?? 0,
          createdAt: t.time * 1000,
          velocity: Math.round(((t.replies ?? 0) / ageH) * 10) / 10,
          url: `https://boards.4chan.org/${board}/thread/${t.no}`,
        });
      }
      ok++;
    } catch (e) {
      lastErr = errMsg(e);
    }
    await new Promise((r) => setTimeout(r, 1050));
  }
  status.push({ name: '4chan', ok: ok > 0, detail: ok > 0 ? `${out.length} threads from ${ok}/${BOARDS.length} boards` : lastErr });
  return out;
}

/** Fastest-moving threads, skipping the permanent "generals" that are always busy. */
export function hotThreads(threads: ChanThread[], limit = 40): ChanThread[] {
  const general = /\/[a-z]{2,6}g\/|general\b/i;
  return threads
    .filter((t) => !general.test(`${t.subject} ${t.excerpt.slice(0, 60)}`))
    .sort((a, b) => b.velocity - a.velocity)
    .slice(0, limit);
}
