#!/usr/bin/env node
// qualify.mjs — fetch each prospect's website (fail-safe) and classify it into
// hot/warm/cold/unknown, writing the result back to streamline_hq.prospects.
// Runs on YOUR machine (this Claude env has no internet). Node 18+ (global fetch).
//
// USAGE (PowerShell):
//   $env:SUPABASE_URL="https://lpjwfjkgqpgydzozuusj.supabase.co"
//   $env:SUPABASE_SERVICE_KEY="<service_role key>"
//   node qualify.mjs                 # qualify prospects not yet qualified
//   node qualify.mjs --all           # re-qualify every prospect
//   node qualify.mjs --limit 50      # cap how many this run
//   node qualify.mjs --ids id1,id2   # only these prospect ids
//
// Politeness: ~1 request/sec, 8s per-request timeout, follows redirects, normal
// User-Agent, NO retries. A fetch failure never crashes the loop — that row is
// marked lead_temp='unknown' and parked for manual review.

import { fileURLToPath } from "node:url";
import { classify, isEmptyWebsite, isSocialOnly } from "./classify.mjs";

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const TIMEOUT_MS = 8000;
const DELAY_MS = 1000; // ~1 req/sec

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function requireEnv() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error("\n❌ Set SUPABASE_URL and SUPABASE_SERVICE_KEY env vars first.");
    process.exit(1);
  }
}

const sbHeaders = (extra = {}) => ({
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Accept-Profile": "streamline_hq",
  ...extra,
});

export async function getProspects({ all = false, limit = null, ids = null } = {}) {
  let q = `${SUPABASE_URL}/rest/v1/prospects?select=id,business_name,website`;
  if (ids && ids.length) q += `&id=in.(${ids.join(",")})`;
  else if (!all) q += `&qualified_at=is.null`;
  if (limit) q += `&limit=${limit}`;
  const res = await fetch(q, { headers: sbHeaders() });
  if (!res.ok) throw new Error(`Fetch prospects failed: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

export async function fetchSite(website) {
  let url = String(website).trim();
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "User-Agent": UA, Accept: "text/html,*/*" },
    });
    if (!res.ok) return { fetchError: true };
    const html = await res.text();
    return { html: html.slice(0, 500000) };
  } catch {
    return { fetchError: true }; // timeout / DNS / TLS / abort — never throw
  } finally {
    clearTimeout(t);
  }
}

export async function updateProspect(id, c) {
  const body = {
    has_website: c.has_website,
    has_booking_system: c.has_booking_system,
    booking_platform: c.booking_platform,
    lead_temp: c.lead_temp,
    qualified_at: new Date().toISOString(),
  };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/prospects?id=eq.${id}`, {
    method: "PATCH",
    headers: sbHeaders({ "Content-Profile": "streamline_hq", "Content-Type": "application/json", Prefer: "return=minimal" }),
    body: JSON.stringify(body),
  });
  if (!res.ok) console.log(`   ⚠ update failed for ${id}: HTTP ${res.status}`);
}

// Qualify one already-loaded prospet row {id, business_name, website}. Returns result.
export async function qualifyOne(p) {
  let result;
  let hitNetwork = false;
  if (isEmptyWebsite(p.website) || isSocialOnly(p.website)) {
    result = classify({ website: p.website });
  } else {
    const fetched = await fetchSite(p.website);
    result = classify({ website: p.website, ...fetched });
    hitNetwork = true;
  }
  await updateProspect(p.id, result);
  return { result, hitNetwork };
}

export async function runQualify(opts = {}) {
  requireEnv();
  const rows = await getProspects(opts);
  console.log(`→ qualifying ${rows.length} prospect(s)\n`);
  const tally = { hot: 0, warm: 0, cold: 0, unknown: 0 };
  for (const p of rows) {
    const { result, hitNetwork } = await qualifyOne(p);
    tally[result.lead_temp] = (tally[result.lead_temp] || 0) + 1;
    const plat = result.booking_platform ? ` [${result.booking_platform}]` : "";
    console.log(`  ${result.lead_temp.toUpperCase().padEnd(7)} ${(p.business_name || p.id).slice(0, 40).padEnd(42)} ${result.reason}${plat}`);
    if (hitNetwork) await sleep(DELAY_MS); // rate-limit only on real network hits
  }
  console.log(`\n✓ done — hot:${tally.hot} warm:${tally.warm} cold:${tally.cold} unknown:${tally.unknown}`);
  console.log("Only hot/warm (and not suppressed) get an outreach card; cold/unknown are parked.");
  return tally;
}

// CLI entry (only when run directly, not when imported by import-csv.mjs).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const all = args.includes("--all");
  const getVal = (flag) => {
    const a = args.find((x) => x === flag || x.startsWith(flag + "="));
    if (!a) return null;
    if (a.includes("=")) return a.split("=")[1];
    return args[args.indexOf(a) + 1] || null;
  };
  const limit = getVal("--limit") ? Number(getVal("--limit")) : null;
  const idsRaw = getVal("--ids");
  const ids = idsRaw ? idsRaw.split(",").map((s) => s.trim()).filter(Boolean) : null;
  runQualify({ all, limit, ids }).catch((e) => { console.error(`\n❌ ${e.message}`); process.exit(1); });
}
