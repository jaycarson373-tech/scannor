/**
 * One scan from the command line or a scheduler:
 *   npm run scan              # scan, print the top ideas, write public/data/latest.json
 *   npm run scan -- --notify  # also ping Telegram/Discord for new high-score open ideas
 *
 * State (narrative weights, ideas already pinged, last Claude run) lives in
 * .state/state.json so repeated runs only alert on genuinely new ideas.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { runScan } from '../src/scan.js';
import { narrativeWeights } from '../src/engine/narratives.js';
import { shouldNotify } from '../src/engine/ideas.js';
import { notify, notifyConfigured } from '../src/notify.js';

const STATE = process.env.SCANNOR_STATE || '.state/state.json';
const OUT = 'public/data/latest.json';
const THRESHOLD = Number(process.env.SCANNOR_ALERT_SCORE || 60);
const CLAUDE_EVERY_MIN = Number(process.env.SCANNOR_CLAUDE_EVERY_MIN || 30);

interface State {
  weights: Record<string, number>;
  notified: Record<string, string>; // idea id -> ISO time pinged
  lastClaudeAt?: string;
}

const load = (): State => (existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : { weights: {}, notified: {} });
const save = (path: string, data: unknown) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2));
};

const args = new Set(process.argv.slice(2));
const state = load();
const minsSinceClaude = state.lastClaudeAt ? (Date.now() - Date.parse(state.lastClaudeAt)) / 60_000 : Infinity;
const useClaude = !args.has('--no-claude') && (args.has('--claude') || minsSinceClaude >= CLAUDE_EVERY_MIN);

const result = await runScan({ previousWeights: state.weights, useClaude });

console.log(`scan ${result.generatedAt} in ${(result.durationMs / 1000).toFixed(1)}s`);
for (const s of result.sources) console.log(`  ${s.ok ? 'ok  ' : 'FAIL'} ${s.name}: ${s.detail}`);
console.log(`  claude: ${result.llm.detail}`);
console.log(`culture meta heat x${result.cultureHeat.toFixed(1)}`);
console.log(`runners ${result.runners.length}, narratives ${result.narratives.length}, ideas ${result.ideas.length}`);
console.log('\ntop runners:');
for (const r of result.runners.slice(0, 8)) console.log(`  $${r.symbol.padEnd(12)} heat ${String(r.heat).padStart(5)}  vol $${Math.round((r.volume24hUsd ?? 0) / 1e3)}K  ${r.name}`);
console.log('\nrising narratives:');
for (const n of result.narratives.slice(0, 10)) console.log(`  ${n.rising ? '↑' : ' '} ${n.term.padEnd(24)} ${n.weight}  runners:${n.runners.length} threads:${n.threads.length}`);
console.log('\ntop ideas:');
for (const i of result.ideas.slice(0, 12)) console.log(`  ${String(i.score).padStart(3)} [${i.availability.status.padEnd(7)}] ${i.kind.padEnd(7)} ${i.name} ($${i.ticker})${i.parent ? ` <- ${i.parent}` : ''}`);

const notified = new Set(Object.keys(state.notified));
if (args.has('--notify')) {
  if (!notifyConfigured()) console.log('\nno TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID or DISCORD_WEBHOOK_URL set; skipping alerts');
  else {
    const fresh = result.ideas.filter((i) => shouldNotify(i, notified, THRESHOLD)).slice(0, 5);
    for (const i of fresh) if (await notify(i)) state.notified[i.id] = new Date().toISOString();
    console.log(`\nalerts sent: ${fresh.length}`);
  }
}

// Forget pings older than a week so a dead name that revives can alert again.
for (const [id, at] of Object.entries(state.notified)) if (Date.now() - Date.parse(at) > 7 * 86_400_000) delete state.notified[id];
state.weights = narrativeWeights(result.narratives);
if (result.llm.ok) state.lastClaudeAt = result.generatedAt;
save(STATE, state);
save(OUT, result);
