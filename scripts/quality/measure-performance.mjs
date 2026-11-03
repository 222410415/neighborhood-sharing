#!/usr/bin/env node
/**
 * Measures response times of main pages and API calls (technical evaluation).
 * Reports, per URL: the first (cold) request, then the median and 95th
 * percentile of N warm requests. Results are written as measured; no target
 * is claimed.
 *
 *   WEB_URL=https://<web> API_URL=https://<api>/v1 N=20 node scripts/quality/measure-performance.mjs
 *   Docker: WEB_URL=http://web:3000 API_URL=http://api:3001/v1 (inside the tools container)
 */

import { mkdirSync, writeFileSync } from "node:fs";

const WEB = (process.env.WEB_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const API = (process.env.API_URL ?? "http://127.0.0.1:3001/v1").replace(/\/$/, "");
const N = Number(process.env.N ?? 20);
const LISTING = process.env.LISTING_ID ?? "itm_cordless-drill";

const targets = [
  ["web", "Explore page", `${WEB}/`],
  ["web", "Item page", `${WEB}/items/${LISTING}`],
  ["web", "Policies page", `${WEB}/policies`],
  ["api", "Health", `${API}/health/live`],
  ["api", "Reference data", `${API}/reference-data`],
  ["api", "Catalogue (first page)", `${API}/listings?pageSize=12`],
  ["api", "Item detail", `${API}/listings/${LISTING}`],
  ["api", "Availability", `${API}/listings/${LISTING}/availability`],
  ["api", "Related items", `${API}/listings/${LISTING}/suggestions`],
  ["api", "Policies", `${API}/policies`],
];

async function timeOnce(url) {
  const started = performance.now();
  const res = await fetch(url, { headers: { "Cache-Control": "no-cache" } });
  await res.arrayBuffer();
  return { ms: performance.now() - started, status: res.status };
}

const pct = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
};

const runAt = new Date().toISOString();
const results = [];
console.log(`Measuring ${targets.length} URLs, 1 cold + ${N} warm requests each`);
for (const [kind, name, url] of targets) {
  try {
    const cold = await timeOnce(url);
    const warm = [];
    const statuses = new Set([cold.status]);
    for (let i = 0; i < N; i++) {
      const t = await timeOnce(url);
      warm.push(t.ms);
      statuses.add(t.status);
    }
    const row = {
      kind,
      name,
      url,
      statuses: [...statuses],
      coldMs: Math.round(cold.ms),
      warmMedianMs: Math.round(pct(warm, 50)),
      warmP95Ms: Math.round(pct(warm, 95)),
      warmRequests: N,
    };
    results.push(row);
    console.log(`${name} | status ${row.statuses.join("/")} | cold ${row.coldMs} ms | median ${row.warmMedianMs} ms | p95 ${row.warmP95Ms} ms`);
  } catch (err) {
    results.push({ kind, name, url, error: String(err) });
    console.log(`${name} | ERROR ${err}`);
  }
}

const dir = new URL("../../reports/", import.meta.url);
mkdirSync(dir, { recursive: true });
const out = new URL(`performance-${runAt.slice(0, 10)}.json`, dir);
writeFileSync(out, JSON.stringify({ runAt, web: WEB, api: API, warmRequestsPerUrl: N, results }, null, 2));
console.log(`Written ${out.pathname}`);
