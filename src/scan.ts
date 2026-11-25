import { fetchPumpPool } from './sources/pumpfun.js';
import { fetchDexBoosted, fetchDexPairs } from './sources/dexscreener.js';
import { fetchChan, hotThreads } from './sources/chan.js';
import { fetchKym } from './sources/kym.js';
import { buildRunners } from './engine/runners.js';
import { buildNarratives } from './engine/narratives.js';
import { checkAvailability } from './engine/availability.js';
import { cultureHeat, cultureIdeas, scoreIdea, type Draft } from './engine/ideas.js';
import { claudeIdeas, MODEL } from './engine/llm.js';
import { mapLimit } from './http.js';
import type { Idea, ScanResult, SourceStatus } from './types.js';

export interface ScanOptions {
  /** Narrative weights from the previous scan, for deltas. */
  previousWeights?: Record<string, number>;
  /** Ask Claude for ideas this run (costs tokens). */
  useClaude?: boolean;
  /** Cap on availability lookups (each is 1-2 HTTP calls). */
  maxChecks?: number;
}

export async function runScan(opts: ScanOptions = {}): Promise<ScanResult> {
  const started = Date.now();
  const sources: SourceStatus[] = [];

  // Market and culture sources are independent; fetch them side by side.
  const [pump, boosted, threadsAll, kym] = await Promise.all([fetchPumpPool(sources), fetchDexBoosted(sources), fetchChan(sources), fetchKym(sources)]);
  const pairs = await fetchDexPairs([...new Set([...pump.map((c) => c.mint), ...boosted])], sources);

  const runners = buildRunners(pump, pairs, boosted, { now: started, maxAgeHours: 48, minVolumeUsd: 100_000 });
  const threads = hotThreads(threadsAll);
  const narratives = buildNarratives(runners, threads, opts.previousWeights);

  const heat = cultureHeat(runners, kym);
  const drafts: Draft[] = cultureIdeas(kym, threads, narratives, heat);
  let llm: ScanResult['llm'] = { enabled: !!opts.useClaude, ok: false, detail: 'off for this run' };
  if (opts.useClaude) {
    const r = await claudeIdeas({ runners, narratives, threads, kym });
    llm = { enabled: true, ok: r.ok, detail: r.detail, model: MODEL };
    // Claude's ideas first so they win the dedupe against a rule-based duplicate.
    drafts.unshift(...r.ideas);
  }
  const unique = [...new Map(drafts.map((d) => [d.id, d])).values()];

  // Check the strongest drafts first; the rest are scored as unknown.
  unique.sort((a, b) => b.conviction - a.conviction);
  const checkN = opts.maxChecks ?? 30;
  const ideas: Idea[] = await mapLimit(unique, 4, async (d, i) => {
    const availability = i < checkN ? await checkAvailability(d) : { status: 'unknown' as const, matches: [], checkedVia: [] };
    return { ...d, availability, score: scoreIdea(d, availability) };
  });
  ideas.sort((a, b) => b.score - a.score);

  return {
    generatedAt: new Date(started).toISOString(),
    durationMs: Date.now() - started,
    runners: runners.slice(0, 40),
    narratives,
    threads,
    kym: kym.slice(0, 60),
    ideas,
    sources,
    llm,
    cultureHeat: heat,
  };
}
