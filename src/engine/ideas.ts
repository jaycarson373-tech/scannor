import type { Availability, ChanThread, Idea, IdeaKind, KymEntry, Narrative, Runner } from '../types.js';
import { norm } from './availability.js';

/** Draft ideas before the availability check fills in `availability` and `score`. */
export type Draft = Omit<Idea, 'availability' | 'score'>;

const ARTICLES = new Set(['the', 'le', 'a', 'an', 'el', 'la']);

/** "Le Toucan" -> TOUCAN, "Jimmy Rustles" -> JIMMY, "Nothing Ever Happens" -> NEH. */
export function deriveTicker(name: string): string {
  const words = name.replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  const core = words.filter((w) => !ARTICLES.has(w.toLowerCase()));
  const pick = core.length ? core : words;
  const joined = pick.join('');
  if (joined.length <= 10) return joined.toUpperCase();
  if (pick[0].length >= 4 && pick[0].length <= 10) return pick[0].toUpperCase();
  return pick.map((w) => w[0]).join('').toUpperCase().slice(0, 10);
}

export const ideaId = (kind: IdeaKind, name: string) => `${kind}:${norm(name)}`;

const titleCase = (s: string) => s.replace(/(^|\s)(\p{Ll})/gu, (_m, sp: string, c: string) => sp + c.toUpperCase());

/** Words that make an idea unlaunchable or off-brand. */
const BLOCK = /\b(cum|porn|nsfw|sex|nude|loli|rape|nigg|fag|tranny|kike|jew|hitler|nazi)/i;

/** "The Amazing Digital Circus Thread" -> "The Amazing Digital Circus". */
const stripThreadWords = (s: string) => s.replace(/\b(thread|general|edition|discussion|megathread)\b/gi, '').replace(/\s+/g, ' ').trim();

/** Boards whose thread titles read like memes; /int/ country threads and /g/ tech support do not. */
const MEME_BOARDS = new Set(['biz', 'pol', 'tv', 'co', 'x']);

/** Things that are clearly not meme names: questions, long sentences, links, ads. */
function memeable(s: string): boolean {
  const words = s.trim().split(/\s+/);
  return s.length >= 3 && s.length <= 40 && words.length <= 5 && !BLOCK.test(s) && !/[?:/]|https?|discord|telegram|\d{3,}/i.test(s);
}

/**
 * How hot the "internet culture as a coin" meta is right now: runners named
 * after a meme site, a KYM entry, or 4chan vocabulary. 1 = cold, up to 1.4.
 */
export function cultureHeat(runners: Runner[], kym: KymEntry[]): number {
  const kymNames = kym.map((k) => norm(k.title)).filter((n) => n.length > 3);
  const hits = runners.filter((r) => {
    const n = norm(`${r.name}`);
    return /4chan|kym|knowyourmeme|meme|anon|wojak|pepe|chan|greentext|janny|reddit/.test(n) || kymNames.some((k) => n.includes(k) || (n.length > 3 && k.includes(n)));
  }).length;
  return 1 + Math.min(0.4, hits * 0.1);
}

export function cultureIdeas(kym: KymEntry[], threads: ChanThread[], narratives: Narrative[], heat = 1): Draft[] {
  const out: Draft[] = [];
  const add = (d: Draft) => {
    if (!out.some((o) => o.id === d.id)) out.push(d);
  };

  const listWeight: Record<KymEntry['list'], number> = { trending: 0.7, newest: 0.55, popular: 0.4 };
  const perList: Record<string, number> = {};
  for (const k of kym) {
    perList[k.list] = (perList[k.list] ?? 0) + 1;
    if (perList[k.list] > 12 || !memeable(k.title)) continue;
    add({
      id: ideaId('culture', k.title),
      kind: 'culture',
      name: k.title,
      ticker: deriveTicker(k.title),
      angle: `Classic internet meme straight off Know Your Meme's ${k.list} list. Same play as Le Toucan / Jimmy Rustles: the meme is the coin.`,
      whyNow: `On KYM ${k.list} right now.`,
      evidence: [k.url],
      conviction: Math.min(0.9, listWeight[k.list] * heat * (1 - (perList[k.list] - 1) * 0.03)),
      source: 'rules',
    });
  }

  for (const t of threads.slice(0, 25)) {
    const subject = stripThreadWords(t.subject);
    if (!MEME_BOARDS.has(t.board) || !subject || subject.split(' ').length > 4 || !memeable(subject) || t.velocity < 15) continue;
    add({
      id: ideaId('culture', subject),
      kind: 'culture',
      name: titleCase(subject.toLowerCase()),
      ticker: deriveTicker(subject),
      angle: `Fast /${t.board}/ thread. 4chan-native names are running ($4CHAN, $KYM, $CHIMA).`,
      whyNow: `${t.replies} replies, ${t.velocity}/hour on /${t.board}/.`,
      evidence: [t.url],
      conviction: Math.min(0.85, (0.35 + t.velocity / 200) * heat),
      source: 'rules',
    });
  }

  for (const n of narratives.slice(0, 15)) {
    if (!n.rising || n.runners.length < 2 || n.threads.length === 0 || !memeable(n.term)) continue;
    add({
      id: ideaId('news', n.term),
      kind: 'news',
      name: titleCase(n.term),
      ticker: deriveTicker(n.term),
      angle: `Rising on 4chan and in runners at once (${n.runners.slice(0, 3).map((s) => '$' + s).join(', ')}).`,
      whyNow: `Weight ${n.weight} (+${n.delta} since last scan) across ${n.runners.length} runners and ${n.threads.length} threads.`,
      evidence: n.threads.slice(0, 3).map((t) => `https://boards.4chan.org/${t.split('/')[0]}/thread/${t.split('/')[1]}`),
      conviction: Math.min(0.8, 0.4 + n.weight / 300),
      source: 'rules',
    });
  }
  return out;
}

/**
 * 0-100. Conviction is the base; an open lane is the multiplier that matters,
 * because a taken name is worth nothing to launch.
 */
export function scoreIdea(d: Draft, a: Availability): number {
  const base = d.conviction * 70 + (d.source === 'claude' ? 10 : 0) + Math.min(d.evidence.length, 3) * 3;
  const lane = { open: 1.15, dead: 0.95, unknown: 0.75, taken: 0.25 }[a.status];
  return Math.max(0, Math.min(100, Math.round(base * lane)));
}

/** Notify-worthy: high score, lane still usable, not already pinged. */
export function shouldNotify(idea: Idea, notified: Set<string>, threshold: number): boolean {
  return idea.score >= threshold && (idea.availability.status === 'open' || idea.availability.status === 'dead') && !notified.has(idea.id);
}
