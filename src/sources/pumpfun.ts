import { getJson, mapLimit, errMsg } from '../http.js';
import type { SourceStatus } from '../types.js';

/**
 * pump.fun frontend API. It sits behind Cloudflare and sometimes challenges
 * datacenter IPs with a 403; every caller treats it as optional.
 */
const BASE = 'https://frontend-api-v3.pump.fun';

export interface PumpCoin {
  mint: string;
  name: string;
  symbol: string;
  description?: string | null;
  created_timestamp?: number | null;
  complete?: boolean | null;
  usd_market_cap?: number | null;
  ath_market_cap?: number | null;
  twitter?: string | null;
  website?: string | null;
}

const asList = (raw: unknown): PumpCoin[] =>
  (Array.isArray(raw) ? raw : (raw as { coins?: PumpCoin[] })?.coins ?? []).filter((c): c is PumpCoin => !!c?.mint);

/** Recently graduated and top-cap coins: the pool runners are picked from. */
export async function fetchPumpPool(status: SourceStatus[]): Promise<PumpCoin[]> {
  const urls = [
    `${BASE}/coins?offset=0&limit=100&sort=created_timestamp&order=DESC&includeNsfw=false&complete=true`,
    `${BASE}/coins?offset=0&limit=100&sort=last_trade_timestamp&order=DESC&includeNsfw=false&complete=true`,
    `${BASE}/coins?offset=0&limit=100&sort=market_cap&order=DESC&includeNsfw=false`,
    `${BASE}/coins/currently-live?offset=0&limit=60&includeNsfw=false`,
  ];
  const seen = new Map<string, PumpCoin>();
  let ok = 0;
  let lastErr = '';
  await mapLimit(urls, 2, async (u) => {
    try {
      for (const c of asList(await getJson(u))) seen.set(c.mint, c);
      ok++;
    } catch (e) {
      lastErr = errMsg(e);
    }
  });
  status.push({ name: 'pump.fun', ok: ok > 0, detail: ok > 0 ? `${seen.size} coins from ${ok}/${urls.length} lists` : `blocked or down (${lastErr})` });
  return [...seen.values()];
}

/** Every pump.fun coin whose name or ticker matches the term. Throws when pump.fun is unreachable. */
export async function searchPump(term: string): Promise<PumpCoin[]> {
  return asList(await getJson(`${BASE}/coins/search-v2?searchTerm=${encodeURIComponent(term)}&limit=50`, 12_000));
}
