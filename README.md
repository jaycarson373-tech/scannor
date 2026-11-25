# Scannor

A front-run desk for Solana memecoins. Every 10 minutes it scans what's moving, finds the narrative, writes launch ideas, checks whether a coin already exists for each one, and pings you only when an idea is strong **and the lane is still open**.

## What it watches

| Source | What it gives |
|---|---|
| pump.fun | Fresh graduations, top caps, live streams. Also the availability check for every idea. |
| DexScreener | Volume, liquidity and price change for each coin; boosted tokens; fallback availability search when pump.fun blocks the server. |
| 4chan (`/biz/ /pol/ /g/ /tv/ /v/ /co/ /int/ /x/`) | Fastest threads by replies per hour. Generals are skipped. |
| Know Your Meme | Newest and popular meme pages: the Le Toucan / Jimmy Rustles play. |

## How an idea is made

1. **Runners**: coins under 48h old (or up 100%+) with $100K+ volume, ranked by √volume. Market caps over 60× liquidity are down-weighted.
2. **Narratives**: words and phrases shared by runners, or by a runner and fast threads, with a delta against the previous scan.
3. **Culture heat**: how hard meme-site / KYM coins are running right now (×1.0 cold to ×1.4 hot). It boosts culture ideas when that meta is live.
4. **Ideas**
   - *Rules*: KYM entries and fast 4chan thread subjects that read like a meme.
   - *Claude*: beta plays (the companion, rival or "other side" of a live runner), plus culture and news angles. Each idea comes with name, ticker, angle, why now, art brief, first tweet and evidence links.
5. **Lane check**: each idea is searched on pump.fun (DexScreener if blocked):
   - `open` means no coin uses the name or ticker.
   - `dead` means only coins that never ran.
   - `taken` means a live coin, or one that peaked over $100K in the last 3 days.
6. **Score** 0-100 from conviction and evidence, multiplied by the lane. A taken lane scores near zero.
7. **Alert** when the score clears `SCANNOR_ALERT_SCORE` (default 60) on an open or dead lane. Each idea alerts once per week.

## Run it

```bash
npm install
cp .env.example .env            # add keys as needed, then: export $(grep -v '^#' .env | xargs)
npm run scan                    # one scan; prints runners, narratives, top ideas
npm run scan -- --notify        # also sends alerts
npm run scan -- --claude        # force a Claude pass this run
npm test
```

Each run writes `public/data/latest.json`, and the dashboard reads it when `/api/scan` isn't available.

## Alerts every 10 minutes (GitHub Actions)

`.github/workflows/scan.yml` runs the scan on a schedule and sends alerts. In the repo, open **Settings → Secrets and variables → Actions**:

- **Secrets**:
  - `ANTHROPIC_API_KEY`
  - `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`, and/or `DISCORD_WEBHOOK_URL`
- **Variables** (optional):
  - `SCANNOR_ALERT_SCORE`, default 60
  - `SCANNOR_CLAUDE_EVERY_MIN`, default 30
  - `SCANNOR_DASHBOARD_URL`

To set up Telegram, create a bot with @BotFather and copy its token. Send the bot any message, then open `https://api.telegram.org/bot<TOKEN>/getUpdates` to find your chat id.

Claude runs at most once every `SCANNOR_CLAUDE_EVERY_MIN` minutes, about 48 calls a day at the default. Raise the number to spend less.

## Dashboard (Vercel)

Import the repo on Vercel; there's no build step. `public/` is the site, and `api/scan.ts` runs a live scan that the CDN caches for 10 minutes. To have the dashboard call Claude too, set `ANTHROPIC_API_KEY` and `SCANNOR_WEB_CLAUDE=1` in Vercel's environment variables.

## Notes

- pump.fun sits behind Cloudflare and sometimes blocks datacenter IPs. Scannor keeps working from DexScreener, and the source bar shows which feeds answered.
- Ideas about real people are framed as parody. Art briefs describe original characters, not official logos.
- These are signals, not financial advice.
