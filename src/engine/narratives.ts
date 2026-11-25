import type { ChanThread, Narrative, Runner } from '../types.js';
import { classifyText } from './metas.js';

/**
 * Narratives = terms (single words and two-word phrases) that carry weight
 * across runners and fast threads at the same time. Runner weight is its heat;
 * thread weight is replies/hour. A term both runners and threads use is worth
 * more than either alone: that overlap is where the next coin usually comes from.
 */

const STOP = new Set(
  `the and for with your you that this from are was not into its our has have will all just now new token coin sol solana pump pumpfun
  official community first only one who what http https com www deployed using j7tracker fun can get got any out but they them his her
  she him why how when where there their about been more most some than then very would could should also like make made going over
  really still even back much many well here want need know think good bad time day year people thread anon anons post posts op lol
  kek desu based just don doesn didn isn aren wasn thing things way say said does did being off ever never every while after before
  general edition game games characters character play played playing anyone someone something nothing everything everyone
  cum porn sex nude dick cock pussy tits nigger niggers faggot jews jew kike tranny`.split(/\s+/),
);

export function terms(text: string): string[] {
  const words = (text.toLowerCase().match(/[a-z][a-z0-9']{2,}/g) ?? []).map((w) => w.replace(/'s$|'/g, '')).filter((w) => w.length > 2 && !STOP.has(w));
  const out = new Set(words);
  for (let i = 0; i < words.length - 1; i++) out.add(`${words[i]} ${words[i + 1]}`);
  return [...out];
}

export function buildNarratives(runners: Runner[], threads: ChanThread[], previous: Record<string, number> = {}, limit = 40): Narrative[] {
  const acc = new Map<string, { w: number; runners: Set<string>; threads: Set<string> }>();
  const get = (t: string) => {
    let a = acc.get(t);
    if (!a) acc.set(t, (a = { w: 0, runners: new Set(), threads: new Set() }));
    return a;
  };
  for (const r of runners) {
    for (const t of terms(`${r.name} ${r.symbol} ${r.description}`)) {
      const a = get(t);
      a.w += r.heat;
      a.runners.add(r.symbol);
    }
  }
  for (const th of threads) {
    for (const t of terms(`${th.subject} ${th.excerpt}`)) {
      const a = get(t);
      a.w += Math.min(th.velocity, 120) / 4; // cap so one megathread can't dominate
      a.threads.add(`${th.board}/${th.no}`);
    }
  }

  const out: Narrative[] = [];
  for (const [term, a] of acc) {
    // A narrative has to show up in the market: thread-only chatter is listed under hot threads instead.
    if (!(a.runners.size >= 2 || (a.runners.size >= 1 && a.threads.size >= 2))) continue;
    const cross = a.runners.size > 0 && a.threads.size > 0 ? 1.6 : 1;
    const weight = Math.round(a.w * cross * 10) / 10;
    const prev = previous[term] ?? 0;
    out.push({
      term,
      weight,
      delta: Math.round((weight - prev) * 10) / 10,
      rising: Object.keys(previous).length > 0 ? weight > prev * 1.5 + 1 : false,
      runners: [...a.runners].slice(0, 8),
      threads: [...a.threads].slice(0, 8),
      metas: classifyText(term).map((m) => m.metaId),
    });
  }
  // Drop single words already covered by a stronger phrase containing them.
  // Terms present in runners AND threads first: that overlap is the narrative.
  const crossFirst = (n: Narrative) => (n.runners.length > 0 && n.threads.length > 0 ? 1 : 0);
  out.sort((a, b) => crossFirst(b) - crossFirst(a) || b.weight - a.weight);
  const kept: Narrative[] = [];
  for (const n of out) {
    if (!n.term.includes(' ') && kept.some((k) => k.term.includes(' ') && k.term.split(' ').includes(n.term) && k.weight >= n.weight * 0.8)) continue;
    kept.push(n);
    if (kept.length >= limit) break;
  }
  return kept;
}

/** Compact weight map stored between scans so the next one can compute deltas. */
export const narrativeWeights = (ns: Narrative[]) => Object.fromEntries(ns.map((n) => [n.term, n.weight]));
