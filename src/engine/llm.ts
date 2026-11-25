import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import type { ChanThread, KymEntry, Narrative, Runner } from '../types.js';
import { deriveTicker, ideaId, type Draft } from './ideas.js';

export const MODEL = process.env.SCANNOR_MODEL || 'claude-opus-5-5';

const IdeaSchema = z.object({
  ideas: z.array(
    z.object({
      kind: z.enum(['beta', 'culture', 'news', 'mascot']),
      name: z.string(),
      ticker: z.string(),
      parent_runner: z.string().nullable(),
      angle: z.string(),
      why_now: z.string(),
      evidence: z.array(z.string()),
      art: z.string(),
      first_tweet: z.string(),
      risk: z.string(),
      conviction: z.number(),
    }),
  ),
});

const SYSTEM = `You are the idea desk for a Solana memecoin creator. Each scan you receive what is moving right now: pump.fun runners, rising narratives, fast 4chan threads and Know Your Meme lists. Your job is to propose coins that do not exist yet and could catch the same wave.

What has worked recently, so calibrate to it:
- Classic internet memes and 4chan culture turned into coins: Jimmy Rustles (KYM "rustled my jimmies"), Le Toucan, $4CHAN, $KYM, Chima (4chan's new lion mascot).
- Beta plays: when a runner is live, its companion, rival, sidekick, origin or "the other side of the joke" often runs next. A beta must make sense to someone who just saw the parent coin.
- Simple, instantly recognisable names beat clever ones. The ticker should be what people would type.

Rules:
- Every idea must be grounded in the input. Put the specific runner, thread URL or KYM URL it comes from in "evidence".
- Prefer names with no existing coin; avoid copying a live runner's name.
- Real people: only as obvious parody, never implying they are involved. Brands and copyrighted characters: suggest original art in the same spirit, never official logos.
- No slurs, no hate, nothing sexual involving minors, nothing that impersonates an official project.
- conviction is 0 to 1: how likely this catches a bid in the next 24h given the evidence. Be stingy; most ideas are 0.3-0.6.
- art: one or two sentences an artist could draw from. first_tweet: under 280 characters, in the voice that is working (short lines, greentext is fine).
Return 8 to 14 ideas, beta plays for the strongest runners first.`;

export interface LlmInput {
  runners: Runner[];
  narratives: Narrative[];
  threads: ChanThread[];
  kym: KymEntry[];
}

export function buildPrompt(input: LlmInput): string {
  const runners = input.runners.slice(0, 15).map((r) => ({
    symbol: r.symbol,
    name: r.name,
    description: r.description.slice(0, 160),
    ageHours: r.createdAt ? Math.round((Date.now() - r.createdAt) / 3_600_000) : null,
    marketCapUsd: r.marketCapUsd ? Math.round(r.marketCapUsd) : null,
    volume24hUsd: r.volume24hUsd ? Math.round(r.volume24hUsd) : null,
    change24hPct: r.priceChange24hPct,
    metas: r.metas,
  }));
  const narratives = input.narratives.slice(0, 20).map((n) => ({ term: n.term, weight: n.weight, rising: n.rising, runners: n.runners, threads: n.threads.length }));
  const threads = input.threads.slice(0, 20).map((t) => ({ board: t.board, subject: t.subject, excerpt: t.excerpt.slice(0, 160), repliesPerHour: t.velocity, url: t.url }));
  const kym = input.kym.slice(0, 30).map((k) => ({ title: k.title, list: k.list, url: k.url }));
  return `Scan at ${new Date().toISOString()}.\n\nRUNNERS (pump.fun, hottest first):\n${JSON.stringify(runners)}\n\nNARRATIVES:\n${JSON.stringify(narratives)}\n\nFAST 4CHAN THREADS:\n${JSON.stringify(threads)}\n\nKNOW YOUR MEME:\n${JSON.stringify(kym)}`;
}

export interface LlmResult {
  ok: boolean;
  detail: string;
  ideas: Draft[];
}

/** Asks Claude for ideas. Never throws: the scan still works on rule-based ideas alone. */
export async function claudeIdeas(input: LlmInput): Promise<LlmResult> {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) return { ok: false, detail: 'no ANTHROPIC_API_KEY set', ideas: [] };
  const client = new Anthropic();
  try {
    const msg = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default', // if a safety classifier declines, the API retries on a fallback model in the same call
      output_config: { effort: 'medium', format: betaZodOutputFormat(IdeaSchema) },
      system: SYSTEM,
      messages: [{ role: 'user', content: buildPrompt(input) }],
    });
    if (msg.stop_reason === 'refusal') return { ok: false, detail: 'model declined this scan', ideas: [] };
    const parsed = msg.parsed_output;
    if (!parsed) return { ok: false, detail: `no parseable output (stop: ${msg.stop_reason})`, ideas: [] };
    const ideas: Draft[] = parsed.ideas.map((i) => {
      const ticker = (i.ticker || deriveTicker(i.name)).replace(/^\$/, '').toUpperCase().slice(0, 10);
      return {
        id: ideaId(i.kind, i.name),
        kind: i.kind,
        name: i.name,
        ticker,
        angle: i.angle,
        whyNow: i.why_now,
        evidence: i.evidence.slice(0, 5),
        art: i.art,
        firstTweet: i.first_tweet,
        risk: i.risk,
        parent: i.parent_runner ?? undefined,
        conviction: Math.max(0, Math.min(1, i.conviction)),
        source: 'claude',
      };
    });
    return { ok: true, detail: `${ideas.length} ideas from ${msg.model}`, ideas };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return { ok: false, detail: 'Anthropic key rejected', ideas: [] };
    if (e instanceof Anthropic.RateLimitError) return { ok: false, detail: 'Anthropic rate limit; will retry next scan', ideas: [] };
    if (e instanceof Anthropic.APIError) return { ok: false, detail: `Anthropic API ${e.status}: ${e.message.slice(0, 160)}`, ideas: [] };
    return { ok: false, detail: e instanceof Error ? e.message : String(e), ideas: [] };
  }
}
