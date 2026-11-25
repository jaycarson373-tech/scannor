import { searchPump } from '../sources/pumpfun.js';
import { searchDex } from '../sources/dexscreener.js';
import type { Availability } from '../types.js';

/**
 * Is a coin for this idea already out? Checks pump.fun search (best: every
 * pump coin, dead or alive) and falls back to DexScreener when pump.fun blocks.
 *
 *  open  - nothing uses the name or ticker
 *  dead  - only coins that never got anywhere (or died long ago); the lane is reusable
 *  taken - a coin with this name is live or recently ran
 */

export const norm = (s: string) => s.toLowerCase().replace(/^\$/, '').replace(/[^a-z0-9]/g, '');

const ALIVE_MCAP = 30_000; // below this a coin is effectively dead
const RECENT_PEAK_HOURS = 72; // a coin that peaked high this recently still owns the name

export function matches(candidate: { name: string; symbol: string }, idea: { name: string; ticker: string }): boolean {
  const n = norm(idea.name);
  const t = norm(idea.ticker);
  const cn = norm(candidate.name);
  const cs = norm(candidate.symbol);
  const nameHit = n.length > 2 && (cn === n || cn.includes(n) || (cn.length > 3 && n.includes(cn)));
  const tickerHit = t.length >= 3 && cs === t;
  return nameHit || tickerHit;
}

export function classify(m: Availability['matches']): Availability['status'] {
  if (m.length === 0) return 'open';
  const live = m.some(
    (c) => (c.marketCapUsd ?? 0) >= ALIVE_MCAP || ((c.athMarketCapUsd ?? 0) >= 100_000 && (c.ageHours ?? 1e9) <= RECENT_PEAK_HOURS),
  );
  return live ? 'taken' : 'dead';
}

export async function checkAvailability(idea: { name: string; ticker: string }, now = Date.now()): Promise<Availability> {
  const checkedVia: string[] = [];
  const found: Availability['matches'] = [];
  const terms = [...new Set([idea.name, idea.ticker.replace(/^\$/, '')].filter((t) => t && t.length > 1))];

  let pumpOk = false;
  for (const term of terms) {
    try {
      for (const c of await searchPump(term)) {
        if (!matches({ name: c.name, symbol: c.symbol }, idea)) continue;
        found.push({
          name: c.name,
          symbol: c.symbol,
          mint: c.mint,
          marketCapUsd: c.usd_market_cap ?? null,
          athMarketCapUsd: c.ath_market_cap ?? null,
          ageHours: c.created_timestamp ? Math.round((now - c.created_timestamp) / 3_600_000) : null,
          graduated: c.complete ?? null,
        });
      }
      pumpOk = true;
    } catch {
      /* pump.fun blocked: fall through to DexScreener */
    }
  }
  if (pumpOk) checkedVia.push('pump.fun');
  if (!pumpOk) {
    for (const term of terms) {
      try {
        for (const p of await searchDex(term)) {
          if (!matches({ name: p.baseToken.name, symbol: p.baseToken.symbol }, idea)) continue;
          found.push({
            name: p.baseToken.name,
            symbol: p.baseToken.symbol,
            mint: p.baseToken.address,
            marketCapUsd: p.marketCap ?? p.fdv ?? null,
            athMarketCapUsd: null,
            ageHours: p.pairCreatedAt ? Math.round((now - p.pairCreatedAt) / 3_600_000) : null,
            graduated: null,
          });
        }
        if (!checkedVia.includes('dexscreener')) checkedVia.push('dexscreener');
      } catch {
        /* both down */
      }
    }
  }
  const dedup = [...new Map(found.map((m) => [m.mint, m])).values()].sort((a, b) => (b.marketCapUsd ?? 0) - (a.marketCapUsd ?? 0));
  return { status: checkedVia.length ? classify(dedup) : 'unknown', matches: dedup.slice(0, 5), checkedVia };
}
