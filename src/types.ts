/** Shared shapes for one scan. Everything here is serialised to the dashboard as-is. */

export interface Runner {
  mint: string;
  name: string;
  symbol: string;
  description: string;
  createdAt: number | null; // ms
  graduated: boolean | null;
  marketCapUsd: number | null;
  athMarketCapUsd: number | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  priceChange24hPct: number | null;
  dexUrl: string | null;
  sources: string[];
  /** √volume-based weight, discounted when the cap looks inflated against liquidity. */
  heat: number;
  metas: string[];
}

export interface ChanThread {
  board: string;
  no: number;
  subject: string;
  excerpt: string;
  replies: number;
  images: number;
  createdAt: number; // ms
  /** Replies per hour since creation: the "is this blowing up" signal. */
  velocity: number;
  url: string;
}

export interface KymEntry {
  slug: string;
  title: string;
  list: 'popular' | 'newest' | 'trending';
  url: string;
}

export interface Narrative {
  term: string;
  weight: number;
  /** weight now minus weight on the previous scan (0 when there is no previous scan). */
  delta: number;
  rising: boolean;
  runners: string[]; // symbols
  threads: string[]; // "board/no"
  metas: string[];
}

export type IdeaKind = 'beta' | 'culture' | 'news' | 'mascot';

export interface Availability {
  status: 'open' | 'dead' | 'taken' | 'unknown';
  /** Coins already using the name/ticker, biggest first. */
  matches: { name: string; symbol: string; mint: string; marketCapUsd: number | null; athMarketCapUsd: number | null; ageHours: number | null; graduated: boolean | null }[];
  checkedVia: string[];
}

export interface Idea {
  id: string; // stable key: kind + normalised name
  kind: IdeaKind;
  name: string;
  ticker: string;
  angle: string;
  whyNow: string;
  evidence: string[];
  art?: string;
  firstTweet?: string;
  risk?: string;
  /** For beta plays: the runner being played off. */
  parent?: string;
  /** 0-1 from the generator (LLM confidence or rule strength). */
  conviction: number;
  availability: Availability;
  score: number; // 0-100, computed
  source: 'rules' | 'claude';
}

export interface SourceStatus {
  name: string;
  ok: boolean;
  detail: string;
}

export interface ScanResult {
  generatedAt: string;
  durationMs: number;
  runners: Runner[];
  narratives: Narrative[];
  threads: ChanThread[];
  kym: KymEntry[];
  ideas: Idea[];
  sources: SourceStatus[];
  llm: { enabled: boolean; ok: boolean; detail: string; model?: string };
  /** 1 = cold, 1.4 = meme-site / KYM coins are running right now. */
  cultureHeat: number;
}
