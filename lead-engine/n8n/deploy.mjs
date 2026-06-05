#!/usr/bin/env node
// Lead Engine — n8n deploy + safe-test helper.
// Runs on YOUR machine (this env has no internet). Secrets stay in your
// shell env; nothing is printed. Node 18+ (global fetch). No deps.
//
// USAGE (PowerShell):
//   $env:N8N_URL="https://dockerfile-1n82.onrender.com"
//   $env:N8N_API_KEY="<n8n Settings -> API -> create key>"
//   # optional, substituted into the workflow nodes:
//   $env:SUPABASE_URL="https://lpjwfjkgqpgydzozuusj.supabase.co"
//   $env:SUPABASE_SERVICE_KEY="<unified project service_role key>"
//   $env:ANTHROPIC_API_KEY="<key>"
//   $env:TELEGRAM_CHAT_ID="<your chat id>"
//   node deploy.mjs            # import/upsert the active workflows
//   node deploy.mjs --test-f   # also fire a SAFE test of Workflow F
//
// Safe by design: nothing here sends WhatsApp. Outbound is fully manual —
// each workflow ends with a tap-to-send wa.me link delivered to Telegram.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DIR = dirname(fileURLToPath(import.meta.url));
const N8N_URL = (process.env.N8N_URL || "").replace(/\/+$/, "");
const N8N_API_KEY = process.env.N8N_API_KEY || "";
const TEST_F = process.argv.includes("--test-f");

const SUBS = {
  SET_SUPABASE_URL: process.env.SUPABASE_URL,
  SET_SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
  SET_ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  SET_APIFY_TOKEN: process.env.APIFY_TOKEN,
  SET_TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID,
};

// Order matters: B2 must import before C so C's "Run B2 Build" node can be
// auto-wired to B2's real workflow id (see B2_NAME handling below).
// Evolution send-loop (D) + auto reply-handler (E) are RETIRED — see ../n8n/_archived.
// Outbound is now manual: every workflow ends with a tap-to-send wa.me link in Telegram.
const FILES = [
  "workflow-A-lead-intake.json",
  "workflow-B2-build-deliver.json",
  "workflow-B-control-card.json",
  "workflow-C-control-handler.json",
  "workflow-F-booking-engagement.json",
  "workflow-G-qualifier.json",
];

const B2_NAME = "Lead Engine — B2: Build & Deliver (send-link)";

function die(msg) {
  console.error(`\n❌ ${msg}`);
  process.exit(1);
}
if (!N8N_URL || !N8N_API_KEY) die("Set N8N_URL and N8N_API_KEY env vars first.");

async function api(path, opts = {}) {
  const res = await fetch(`${N8N_URL}/api/v1${path}`, {
    ...opts,
    headers: {
      "X-N8N-API-KEY": N8N_API_KEY,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  return { ok: res.ok, status: res.status, body };
}

function applySubs(raw) {
  const missing = [];
  for (const [k, v] of Object.entries(SUBS)) {
    if (raw.includes(k)) {
      if (!v) missing.push(k);
      else raw = raw.split(k).join(v);
    }
  }
  return { raw, missing };
}

(async () => {
  console.log(`→ n8n: ${N8N_URL}`);
  const ping = await api("/workflows?limit=1");
  if (!ping.ok)
    die(`Can't reach n8n API (HTTP ${ping.status}). Check URL + API key + that n8n's Public API is enabled. Body: ${JSON.stringify(ping.body).slice(0, 300)}`);
  console.log("✓ n8n API reachable\n");

  const existing = await api("/workflows?limit=250");
  const byName = new Map(
    (existing.body?.data || []).map((w) => [w.name, w.id]),
  );
  // B2's id — from an earlier import this run, or one already in n8n — so E's
  // "Call B2" node points at the real sub-workflow instead of the placeholder.
  let b2Id = byName.get(B2_NAME) || null;

  for (const file of FILES) {
    const wf = JSON.parse(readFileSync(join(DIR, file), "utf8"));
    let { raw, missing } = applySubs(JSON.stringify(wf));
    if (raw.includes("SET_B2_WORKFLOW_ID")) {
      if (b2Id) raw = raw.split("SET_B2_WORKFLOW_ID").join(b2Id);
      else missing = [...missing, "SET_B2_WORKFLOW_ID (import B2 first, or set the Call B2 node manually)"];
    }
    if (missing.length)
      console.log(`⚠ ${file}: no env value for ${missing.join(", ")} — left as placeholder, fix in n8n UI.`);
    const payload = JSON.parse(raw);
    const clean = {
      name: payload.name,
      nodes: payload.nodes,
      connections: payload.connections,
      settings: payload.settings || { executionOrder: "v1" },
    };
    const id = byName.get(payload.name);
    const r = id
      ? await api(`/workflows/${id}`, { method: "PUT", body: JSON.stringify(clean) })
      : await api("/workflows", { method: "POST", body: JSON.stringify(clean) });
    if (!r.ok) {
      console.log(`❌ ${payload.name}: HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 400)}`);
      continue;
    }
    const wfId = r.body?.id || id;
    if (payload.name === B2_NAME) b2Id = wfId; // so E (imported after) wires to it
    console.log(`✓ ${id ? "updated" : "created"}: "${payload.name}" (id ${wfId})`);
    if (file.includes("workflow-F")) {
      console.log(`  Webhook (after you Activate it in n8n): ${N8N_URL}/webhook/lead-engine-booking`);
    }
  }

  console.log(
    "\nNext (in n8n UI): attach a Telegram credential to every Telegram node," +
      " confirm C's 'Run B2 Build' points at the B2 workflow, review each node," +
      " then Activate B (control card), C (control handler) and F.\n" +
      "Nothing sends WhatsApp — you send manually via the wa.me links in Telegram.",
  );

  if (TEST_F) {
    console.log("\n--test-f: posting a SAFE fake booking to Workflow F's TEST webhook…");
    console.log("(F only drafts + sends a tap-to-send wa.me link to Telegram — no WhatsApp is sent.)");
    const r = await fetch(`${N8N_URL}/webhook-test/lead-engine-booking`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: { slug: "demo-salon" } }),
    }).catch((e) => ({ ok: false, status: 0, _e: e.message }));
    console.log(
      `   → HTTP ${r.status ?? "?"}. In n8n, open Workflow F and click "Listen for test event" first, ` +
        `then re-run this with --test-f. Check the execution log and paste it back.`,
    );
  }
})();
