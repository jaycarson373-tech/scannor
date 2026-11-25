import { describe, expect, it } from 'vitest';
import { deriveTicker, scoreIdea, shouldNotify, cultureIdeas, cultureHeat, type Draft } from '../src/engine/ideas.js';
import { classify, matches, norm } from '../src/engine/availability.js';
import { buildNarratives, terms } from '../src/engine/narratives.js';
import { cleanKymTitle, parseKymList } from '../src/sources/kym.js';
import { cleanHtml, hotThreads } from '../src/sources/chan.js';
import { buildRunners } from '../src/engine/runners.js';
import type { Availability, ChanThread, Idea, Runner } from '../src/types.js';

const runner = (over: Partial<Runner>): Runner => ({
  mint: 'm', name: 'X', symbol: 'X', description: '', createdAt: Date.now(), graduated: true, marketCapUsd: 1e5, athMarketCapUsd: 1e5,
  liquidityUsd: 3e4, volume24hUsd: 5e5, priceChange24hPct: 50, dexUrl: null, sources: [], heat: 7, metas: [], ...over,
});
const thread = (over: Partial<ChanThread>): ChanThread => ({
  board: 'biz', no: 1, subject: '', excerpt: '', replies: 100, images: 0, createdAt: Date.now() - 3_600_000, velocity: 100, url: 'u', ...over,
});
const avail = (status: Availability['status']): Availability => ({ status, matches: [], checkedVia: ['pump.fun'] });

describe('deriveTicker', () => {
  it('drops articles and keeps short names whole', () => {
    expect(deriveTicker('Le Toucan')).toBe('TOUCAN');
    expect(deriveTicker('Me Gusta')).toBe('MEGUSTA');
    expect(deriveTicker('Jimmy Rustles')).toBe('JIMMY');
  });
  it('falls back to initials for long phrases', () => {
    expect(deriveTicker('Nothing Ever Happens Ok')).toBe('NOTHING');
    expect(deriveTicker('Do It For The Culture Now')).toBe('DIFCN'); // "The" is dropped like other articles
  });
});

describe('KYM parsing', () => {
  it('takes the clean title from image alt text', () => {
    expect(cleanKymTitle('Huss Huss Huss / In This Town Everybody Goes Out Partying Except Me meme example image.')).toBe('Huss Huss Huss');
    expect(cleanKymTitle('Jupiter Incident 2011 image example.')).toBe('Jupiter Incident 2011');
    expect(cleanKymTitle('Do a Barrel Roll starfox')).toBe('Do a Barrel Roll');
    expect(cleanKymTitle('Le Toucan')).toBe('Le Toucan');
  });
  it('dedupes entries and skips nav links', () => {
    const html = '<a href="/memes/le-toucan"><img alt="Le Toucan"></a><a href="/memes/le-toucan">x</a><a href="/memes/popular">Popular</a>';
    expect(parseKymList(html, 'newest').map((e) => e.title)).toEqual(['Le Toucan']);
  });
});

describe('availability', () => {
  it('matches on normalised name or exact 3+ char ticker', () => {
    expect(matches({ name: 'Le Toucan', symbol: 'TOUCAN' }, { name: 'Le Toucan', ticker: 'TOUCAN' })).toBe(true);
    expect(matches({ name: 'Something Else', symbol: 'TOUCAN' }, { name: 'Le Toucan', ticker: 'TOUCAN' })).toBe(true);
    expect(matches({ name: 'Toucanet Labs', symbol: 'TLAB' }, { name: 'Pink Wojak', ticker: 'PINK' })).toBe(false);
    expect(norm('$Le-Toucan!')).toBe('letoucan');
  });
  it('calls a lane taken only when a match is alive or peaked recently', () => {
    expect(classify([])).toBe('open');
    expect(classify([{ name: 'a', symbol: 'A', mint: '1', marketCapUsd: 4_000, athMarketCapUsd: 20_000, ageHours: 500, graduated: false }])).toBe('dead');
    expect(classify([{ name: 'a', symbol: 'A', mint: '1', marketCapUsd: 50_000, athMarketCapUsd: 60_000, ageHours: 500, graduated: true }])).toBe('taken');
    expect(classify([{ name: 'a', symbol: 'A', mint: '1', marketCapUsd: 5_000, athMarketCapUsd: 300_000, ageHours: 10, graduated: true }])).toBe('taken');
  });
});

describe('scoring and alerts', () => {
  const draft: Draft = { id: 'culture:x', kind: 'culture', name: 'X', ticker: 'X', angle: '', whyNow: '', evidence: ['a'], conviction: 0.8, source: 'claude' };
  it('an open lane scores far above a taken one', () => {
    expect(scoreIdea(draft, avail('open'))).toBeGreaterThan(scoreIdea(draft, avail('taken')) * 3);
  });
  it('alerts once, only for usable lanes above threshold', () => {
    const idea: Idea = { ...draft, availability: avail('open'), score: scoreIdea(draft, avail('open')) };
    expect(shouldNotify(idea, new Set(), 60)).toBe(true);
    expect(shouldNotify(idea, new Set(['culture:x']), 60)).toBe(false);
    expect(shouldNotify({ ...idea, availability: avail('taken') }, new Set(), 0)).toBe(false);
  });
});

describe('narratives', () => {
  it('extracts words and bigrams without stopwords', () => {
    expect(terms('The GPU Father is back')).toEqual(expect.arrayContaining(['gpu', 'father', 'gpu father']));
    expect(terms('the token coin')).toEqual([]);
  });
  it('needs the market: thread-only chatter is not a narrative', () => {
    const ns = buildNarratives(
      [runner({ symbol: 'GPU', name: 'Jensen GPU', heat: 10 }), runner({ symbol: 'JENSEN', name: 'Jensen Is Back', heat: 8 })],
      [thread({ subject: 'jensen fired', no: 2 }), thread({ subject: 'canada mexico', no: 3 }), thread({ subject: 'canada mexico', no: 4 })],
    );
    expect(ns.map((n) => n.term)).toContain('jensen');
    expect(ns.map((n) => n.term)).not.toContain('canada');
  });
  it('flags terms that grew since the last scan', () => {
    const rs = [runner({ symbol: 'A', name: 'Toucan', heat: 20 }), runner({ symbol: 'B', name: 'Toucan Two', heat: 20 })];
    expect(buildNarratives(rs, [], { toucan: 5 }).find((n) => n.term === 'toucan')?.rising).toBe(true);
  });
});

describe('sources', () => {
  it('cleans 4chan html and skips generals in hot threads', () => {
    expect(cleanHtml('a<br>&gt;be me &amp; you')).toBe('a >be me & you');
    const hot = hotThreads([thread({ subject: '/smg/ - Stock Market General', velocity: 500 }), thread({ subject: 'janny deleted my post', velocity: 40, no: 9 })]);
    expect(hot.map((t) => t.no)).toEqual([9]);
  });
  it('culture heat rises when meme-site coins are running', () => {
    expect(cultureHeat([runner({ name: '4CHAN' }), runner({ name: 'KnowYourMeme' })], [])).toBeCloseTo(1.2);
    expect(cultureHeat([runner({ name: 'Dog' })], [])).toBe(1);
  });
  it('culture ideas skip NSFW and question-style titles', () => {
    const ids = cultureIdeas(
      [{ slug: 'a', title: 'Le Toucan', list: 'newest', url: 'u' }, { slug: 'b', title: 'why is everyone here?', list: 'newest', url: 'u' }],
      [thread({ subject: 'cum thread', velocity: 90 })],
      [],
    ).map((d) => d.name);
    expect(ids).toEqual(['Le Toucan']);
  });
});

describe('runners', () => {
  it('keeps fresh coins with volume and down-weights inflated caps', () => {
    const now = Date.now();
    const pump = [
      { mint: 'a', name: 'Fresh', symbol: 'FR', created_timestamp: now - 3_600_000, complete: true },
      { mint: 'b', name: 'Old', symbol: 'OLD', created_timestamp: now - 500 * 3_600_000, complete: true },
    ];
    const pair = (mint: string, vol: number, mcap: number, liq: number, ch = 10) => ({
      chainId: 'solana', dexId: 'pumpswap', pairAddress: mint, baseToken: { address: mint, name: mint, symbol: mint }, volume: { h24: vol }, marketCap: mcap, liquidity: { usd: liq }, priceChange: { h24: ch },
    });
    const pairs = new Map([['a', pair('a', 1e6, 1e7, 1e4)], ['b', pair('b', 1e6, 1e6, 1e5)]]);
    const rs = buildRunners(pump, pairs, [], { now, maxAgeHours: 48, minVolumeUsd: 1e5 });
    expect(rs.map((r) => r.symbol)).toEqual(['FR']);
    expect(rs[0].heat).toBeCloseTo(3.5);
  });
});
