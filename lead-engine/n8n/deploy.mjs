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
//   $env:EVOLUTION_URL="..."; $env:EVOLUTION_INSTANCE="..."; $env:EVOLUTION_API_KEY="..."
//   node deploy.mjs            # import/upsert both workflows
//   node deploy.mjs --test-f   # also fire a SAFE test of Workflow F
//
// Safe by design: never activates the send-loop, never sends WhatsApp.

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
  SET_TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID,
  SET_EVOLUTION_URL: process.env.EVOLUTION_URL,
  SET_EVOLUTION_INSTANCE: process.env.EVOLUTION_INSTANCE,
  SET_EVOLUTION_API_KEY: process.env.EVOLUTION_API_KEY,
};

const FILES = [
  "workflow-F-booking-engagement.json",
  "workflow-D-send-loop.json",
];

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

  for (const file of FILES) {
    const wf = JSON.parse(readFileSync(join(DIR, file), "utf8"));
    const { raw, missing } = applySubs(JSON.stringify(wf));
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
    console.log(`✓ ${id ? "updated" : "created"}: "${payload.name}" (id ${wfId})`);
    if (file.includes("workflow-F")) {
      console.log(`  Webhook (after you Activate it in n8n): ${N8N_URL}/webhook/lead-engine-booking`);
    }
  }

  console.log(
    "\nNext (in n8n UI): attach a Telegram credential to the Telegram node," +
      " review each node, then Activate Workflow F.\n" +
      "Do NOT activate the send-loop until you've approved going live.",
  );

  if (TEST_F) {
    console.log("\n--test-f: posting a SAFE fake booking to Workflow F's TEST webhook…");
    console.log("(F only drafts + Telegram-alerts + inserts pending_approval — no WhatsApp is sent.)");
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
