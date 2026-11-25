import { getJson, errMsg } from '../http.js';
import type { SourceStatus } from '../types.js';

const BASE = 'https://api.dexscreener.com';

export interface DexPair {
  chainId: string;
  dexId: string;
  url?: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  priceChange?: { h24?: number };
  volume?: { h24?: number };
  liquidity?: { usd?: number } | null;
  marketCap?: number;
  fdv?: number;
  pairCreatedAt?: number;
  info?: { socials?: { type: string; url: string }[]; websites?: { url: string }[] } | null;
}

/** Solana mints DexScreener is promoting right now (boosted / freshly profiled). */
export async function fetchDexBoosted(status: SourceStatus[]): Promise<string[]> {
  const mints = new Set<string>();
  const paths = ['/token-boosts/top/v1', '/token-boosts/latest/v1', '/token-profiles/latest/v1'];
  let ok = 0;
  let lastErr = '';
  for (const p of paths) {
    try {
      const raw = await getJson<{ chainId: string; tokenAddress: string }[]>(BASE + p);
      for (const t of Array.isArray(raw) ? raw : []) if (t.chainId === 'solana') mints.add(t.tokenAddress);
      ok++;
    } catch (e) {
      lastErr = errMsg(e);
    }
  }
  status.push({ name: 'DexScreener boosts', ok: ok > 0, detail: ok > 0 ? `${mints.size} promoted Solana mints` : lastErr });
  return [...mints];
}

/** Best (most liquid) pair per mint, 30 mints per request. */
export async function fetchDexPairs(mints: string[], status: SourceStatus[]): Promise<Map<string, DexPair>> {
  const best = new Map<string, DexPair>();
  let failed = 0;
  for (let i = 0; i < mints.length; i += 30) {
    try {
      const raw = await getJson<DexPair[]>(`${BASE}/tokens/v1/solana/${mints.slice(i, i + 30).join(',')}`);
      for (const p of Array.isArray(raw) ? raw : []) {
        const prev = best.get(p.baseToken.address);
        if (!prev || (p.liquidity?.usd ?? 0) > (prev.liquidity?.usd ?? 0)) best.set(p.baseToken.address, p);
      }
    } catch {
      failed++;
    }
  }
  status.push({ name: 'DexScreener pairs', ok: best.size > 0 || mints.length === 0, detail: `${best.size} tokens priced${failed ? `, ${failed} batches failed` : ''}` });
  return best;
}

/** Solana pairs whose name/ticker match a term. Used as the availability fallback when pump.fun blocks us. */
export async function searchDex(term: string): Promise<DexPair[]> {
  const raw = await getJson<{ pairs?: DexPair[] }>(`${BASE}/latest/dex/search?q=${encodeURIComponent(term)}`, 12_000);
  return (raw.pairs ?? []).filter((p) => p.chainId === 'solana');
}
