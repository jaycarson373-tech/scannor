import { getText, errMsg } from '../http.js';
import type { KymEntry, SourceStatus } from '../types.js';

/** Know Your Meme list pages, scraped for meme slugs and titles. */
const LISTS: { list: KymEntry['list']; url: string }[] = [
  { list: 'newest', url: 'https://knowyourmeme.com/memes/all?sort=newest' },
  { list: 'popular', url: 'https://knowyourmeme.com/memes/popular' },
];

const NAV = new Set(['popular', 'trending', 'all', 'submissions', 'researching', 'confirmed', 'deadpool', 'random', 'new', 'newest', 'page']);

/** "Huss Huss Huss / In This Town ... meme example image." -> "Huss Huss Huss" */
export function cleanKymTitle(raw: string): string {
  return raw
    .split(' / ')[0]
    .replace(/\s*\b(meme|memes|image|images|example|examples|cover|screenshot|gif|video)\b[\w\s.,]*$/i, '')
    .replace(/[.\s]+$/, '')
    .trim()
    // Alt text often trails a lowercase word ("Do a Barrel Roll starfox"); title words are capitalised.
    .replace(/(\s+[a-z][a-z0-9-]*)+$/, (tail, _w, offset: number, whole: string) => (offset > 0 && /[A-Z]/.test(whole.slice(0, offset)) ? '' : tail));
}

export function parseKymList(html: string, list: KymEntry['list']): KymEntry[] {
  const out = new Map<string, KymEntry>();
  const re = /href="\/memes\/([a-z0-9-]+)"[^>]*>([\s\S]*?)<\/a>/g;
  for (const m of html.matchAll(re)) {
    const slug = m[1];
    if (NAV.has(slug) || out.has(slug)) continue;
    const alt = /alt="([^"]+)"/.exec(m[2])?.[1];
    const text = (alt ?? m[2].replace(/<[^>]+>/g, ' '))
      .replace(/&amp;/g, '&')
      .replace(/&#39;|&#039;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim();
    const cleaned = cleanKymTitle(text);
    const title = cleaned.length >= 3 && cleaned.length <= 80 ? cleaned : slug.replace(/-/g, ' ');
    out.set(slug, { slug, title, list, url: `https://knowyourmeme.com/memes/${slug}` });
  }
  return [...out.values()];
}

export async function fetchKym(status: SourceStatus[]): Promise<KymEntry[]> {
  const out = new Map<string, KymEntry>();
  const got: string[] = [];
  let lastErr = '';
  for (const { list, url } of LISTS) {
    try {
      const entries = parseKymList(await getText(url), list);
      for (const e of entries) if (!out.has(e.slug)) out.set(e.slug, e);
      got.push(`${list} ${entries.length}`);
    } catch (e) {
      lastErr = errMsg(e);
    }
  }
  status.push({ name: 'Know Your Meme', ok: got.length > 0, detail: got.length ? got.join(', ') : lastErr });
  return [...out.values()];
}
