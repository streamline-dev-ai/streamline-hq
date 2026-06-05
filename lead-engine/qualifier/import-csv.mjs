#!/usr/bin/env node
// import-csv.mjs — import a Phantombuster / Apify Google-Maps CSV into
// streamline_hq.prospects, then qualify the newly-imported rows.
// Runs on YOUR machine. Node 18+.
//
// USAGE (PowerShell):
//   $env:SUPABASE_URL="https://lpjwfjkgqpgydzozuusj.supabase.co"
//   $env:SUPABASE_SERVICE_KEY="<service_role key>"
//   node import-csv.mjs ./leads.csv               # import + qualify
//   node import-csv.mjs ./leads.csv --no-qualify  # import only
//   node import-csv.mjs ./leads.csv --niche "nail salon"   # default niche
//
// De-dupes on slug: an existing prospect is skipped (not overwritten).

import { readFileSync } from "node:fs";
import { runQualify } from "./qualify.mjs";

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "";
const args = process.argv.slice(2);
const FILE = args.find((a) => !a.startsWith("--"));
const NO_QUALIFY = args.includes("--no-qualify");
const nicheFlag = args.find((a) => a.startsWith("--niche"));
const DEFAULT_NICHE = nicheFlag ? (nicheFlag.split("=")[1] || args[args.indexOf(nicheFlag) + 1] || "") : "";

function die(m) { console.error(`\n❌ ${m}`); process.exit(1); }
if (!SUPABASE_URL || !SERVICE_KEY) die("Set SUPABASE_URL and SUPABASE_SERVICE_KEY env vars first.");
if (!FILE) die("Pass the CSV path: node import-csv.mjs ./leads.csv");

// --- tiny RFC-4180-ish CSV parser (handles quotes, commas, newlines in quotes) ---
function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQ = false;
  text = text.replace(/^﻿/, ""); // strip BOM
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const norm = (s) => String(s || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
// header alias → canonical field
const ALIASES = {
  business_name: ["businessname", "name", "title", "companyname", "company"],
  website: ["website", "url", "site", "domain", "websiteurl"],
  phone: ["phone", "phonenumber", "phonee164", "telephone", "tel", "mobile"],
  niche: ["niche", "category", "categoryname", "type", "maincategory"],
  suburb: ["suburb", "area", "city", "neighborhood", "neighbourhood", "locality"],
  instagram: ["instagram", "instagramurl", "instagramhandle", "ig"],
  google_rating: ["googlerating", "rating", "totalscore", "stars", "score"],
  source: ["source"],
};

function buildMapper(headerRow) {
  const idx = {};
  headerRow.forEach((h, i) => { idx[norm(h)] = i; });
  const find = (canon) => {
    for (const a of ALIASES[canon]) if (a in idx) return idx[a];
    return -1;
  };
  const map = {};
  for (const canon of Object.keys(ALIASES)) map[canon] = find(canon);
  return map;
}

function slugify(s) {
  return String(s || "").toLowerCase().trim()
    .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}
function phoneE164(raw) {
  let d = String(raw || "").replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("0")) d = "27" + d.slice(1);
  else if (d.length === 9) d = "27" + d;
  return d;
}

const sbHeaders = (extra = {}) => ({
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Accept-Profile": "streamline_hq",
  ...extra,
});

async function slugExists(slug) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/prospects?slug=eq.${encodeURIComponent(slug)}&select=id&limit=1`, { headers: sbHeaders() });
  if (!res.ok) return false;
  const j = await res.json();
  return Array.isArray(j) && j.length > 0;
}

async function insertProspect(p) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/prospects`, {
    method: "POST",
    headers: sbHeaders({ "Content-Profile": "streamline_hq", "Content-Type": "application/json", Prefer: "return=representation" }),
    body: JSON.stringify(p),
  });
  if (!res.ok) { console.log(`   ⚠ insert failed (${p.slug}): HTTP ${res.status} ${(await res.text()).slice(0, 200)}`); return null; }
  const j = await res.json();
  return Array.isArray(j) ? j[0]?.id : j?.id;
}

(async () => {
  const rows = parseCSV(readFileSync(FILE, "utf8"));
  if (rows.length < 2) die("CSV has no data rows.");
  const map = buildMapper(rows[0]);
  if (map.business_name === -1) die("Could not find a business-name column in the CSV header.");

  const get = (row, canon) => (map[canon] === -1 ? "" : (row[map[canon]] || "").trim());
  const insertedIds = [];
  let skipped = 0, bad = 0;

  for (const row of rows.slice(1)) {
    const business_name = get(row, "business_name");
    if (!business_name) { bad++; continue; }
    const slug = slugify(business_name);
    if (!slug) { bad++; continue; }
    if (await slugExists(slug)) { skipped++; continue; }

    const phone = phoneE164(get(row, "phone"));
    const ratingRaw = get(row, "google_rating");
    const rating = ratingRaw && !isNaN(Number(ratingRaw)) ? Number(ratingRaw) : null;
    const prospect = {
      source: get(row, "source") || "csv_import",
      business_name,
      slug,
      niche: get(row, "niche") || DEFAULT_NICHE || null,
      suburb: get(row, "suburb") || null,
      phone_e164: phone,
      whatsapp_e164: phone,
      website: get(row, "website") || null,
      instagram_handle: get(row, "instagram") || null,
      google_rating: rating,
      status: "new",
    };
    const id = await insertProspect(prospect);
    if (id) { insertedIds.push(id); console.log(`  + ${business_name} (${slug})`); }
  }

  console.log(`\n✓ imported ${insertedIds.length}, skipped ${skipped} existing, ${bad} unusable rows.`);

  if (!NO_QUALIFY && insertedIds.length) {
    console.log(`\n→ qualifying the ${insertedIds.length} new prospect(s)…\n`);
    await runQualify({ ids: insertedIds });
  } else if (NO_QUALIFY) {
    console.log("Skipped qualification (--no-qualify). Run: node qualify.mjs");
  }
})().catch((e) => die(e.message));
