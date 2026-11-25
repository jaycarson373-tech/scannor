import type { PumpCoin } from '../sources/pumpfun.js';
import type { DexPair } from '../sources/dexscreener.js';
import type { Runner } from '../types.js';
import { classifyText } from './metas.js';

/** A market cap more than this many times its pool liquidity is mostly paper. */
export const INFLATED_RATIO = 60;

export interface RunnerOptions {
  now: number;
  maxAgeHours: number;
  minVolumeUsd: number;
}

/**
 * Merges pump.fun coins and DexScreener pairs into "runners": young or ripping
 * tokens with real volume, ranked by √volume heat.
 */
export function buildRunners(pump: PumpCoin[], pairs: Map<string, DexPair>, boosted: string[], opts: RunnerOptions): Runner[] {
  const byMint = new Map(pump.map((c) => [c.mint, c]));
  const mints = new Set([...byMint.keys(), ...boosted, ...pairs.keys()]);
  const cutoff = opts.now - opts.maxAgeHours * 3_600_000;
  const out: Runner[] = [];

  for (const mint of mints) {
    const p = byMint.get(mint);
    const d = pairs.get(mint);
    if (!p && !d) continue;
    const volume = d?.volume?.h24 ?? null;
    if ((volume ?? 0) < opts.minVolumeUsd) continue;
    const createdAt = p?.created_timestamp ?? d?.pairCreatedAt ?? null;
    const change = d?.priceChange?.h24 ?? null;
    const fresh = createdAt !== null && createdAt >= cutoff;
    if (!fresh && (change ?? 0) < 100) continue;

    const mcap = d?.marketCap ?? p?.usd_market_cap ?? null;
    const liq = d?.liquidity?.usd ?? null;
    const inflated = mcap !== null && liq !== null && liq > 0 && mcap / liq > INFLATED_RATIO;
    const name = p?.name || d?.baseToken.name || '';
    const symbol = (p?.symbol || d?.baseToken.symbol || '').trim();
    const description = p?.description ?? '';
    const sources = [p ? 'pump.fun' : null, d ? 'dexscreener' : null, boosted.includes(mint) ? 'boosted' : null].filter((s): s is string => !!s);

    out.push({
      mint,
      name,
      symbol,
      description: description.slice(0, 240),
      createdAt,
      graduated: p?.complete ?? null,
      marketCapUsd: mcap,
      athMarketCapUsd: p?.ath_market_cap ?? null,
      liquidityUsd: liq,
      volume24hUsd: volume,
      priceChange24hPct: change,
      dexUrl: d?.url ?? null,
      sources,
      heat: Math.round((Math.sqrt(volume ?? 0) / 100) * (inflated ? 0.35 : 1) * 10) / 10,
      metas: classifyText(`${name} ${symbol} ${description}`).map((m) => m.metaId),
    });
  }
  return out.sort((a, b) => b.heat - a.heat);
}
