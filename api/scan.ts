import { runScan } from '../src/scan.js';
import type { ScanResult } from '../src/types.js';

/**
 * GET /api/scan: a live scan for the dashboard. The CDN caches it for 10
 * minutes so page views don't each trigger a scan (or a Claude call).
 * Claude runs here only when SCANNOR_WEB_CLAUDE=1.
 */
let cache: { at: number; data: ScanResult } | null = null;
const TTL = 10 * 60_000;

export async function GET(): Promise<Response> {
  if (!cache || Date.now() - cache.at > TTL) {
    const data = await runScan({ useClaude: process.env.SCANNOR_WEB_CLAUDE === '1', maxChecks: 20 });
    cache = { at: Date.now(), data };
  }
  return new Response(JSON.stringify(cache.data), {
    headers: {
      'content-type': 'application/json',
      'cache-control': 'public, s-maxage=600, stale-while-revalidate=1200',
    },
  });
}
