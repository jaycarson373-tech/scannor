import type { Idea } from './types.js';

/** Telegram and/or Discord. Both optional; configured by env vars, never by code. */

const fmtUsd = (n: number | null) => (n === null ? '?' : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${Math.round(n)}`);

export function formatIdea(i: Idea, dashboardUrl?: string): string {
  const lane =
    i.availability.status === 'open'
      ? 'OPEN, no coin yet'
      : i.availability.status === 'dead'
        ? `only dead coins (best ${fmtUsd(i.availability.matches[0]?.athMarketCapUsd ?? i.availability.matches[0]?.marketCapUsd ?? null)} peak)`
        : i.availability.status;
  const lines = [
    `🚨 ${i.score}/100 · ${i.kind.toUpperCase()}${i.parent ? ` off $${i.parent.replace(/^\$/, '')}` : ''}`,
    `${i.name} ($${i.ticker})`,
    '',
    i.angle,
    `Why now: ${i.whyNow}`,
    `Lane: ${lane}`,
  ];
  if (i.art) lines.push(`Art: ${i.art}`);
  if (i.firstTweet) lines.push('', `First tweet:\n${i.firstTweet}`);
  if (i.evidence.length) lines.push('', `Evidence: ${i.evidence.slice(0, 3).join(' ')}`);
  if (dashboardUrl) lines.push('', dashboardUrl);
  return lines.join('\n');
}

export async function sendTelegram(text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return false;
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chat, text: text.slice(0, 4000), disable_web_page_preview: true }),
  });
  return res.ok;
}

export async function sendDiscord(text: string): Promise<boolean> {
  const hook = process.env.DISCORD_WEBHOOK_URL;
  if (!hook) return false;
  const res = await fetch(hook, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: text.slice(0, 1990) }) });
  return res.ok;
}

export const notifyConfigured = () => !!((process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) || process.env.DISCORD_WEBHOOK_URL);

export async function notify(i: Idea): Promise<boolean> {
  const text = formatIdea(i, process.env.SCANNOR_DASHBOARD_URL);
  const [tg, dc] = await Promise.all([sendTelegram(text).catch(() => false), sendDiscord(text).catch(() => false)]);
  return tg || dc;
}
