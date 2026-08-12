/**
 * Audits which ACTIVE n8n workflows actually cost memory.
 *
 *   npm run audit:n8n-triggers
 *
 * Why this exists: when the Render instance OOM-crashes the instinct is to delete old
 * workflows. That is usually wrong. A webhook trigger is just a route in a lookup table
 * and costs ~nothing while idle, so archiving it frees nothing. Only polling triggers
 * and persistent connections (IMAP, message queues) cost memory continuously.
 *
 * Run this before archiving anything, so the decision is based on trigger type rather
 * than on `updatedAt`, which shows last *edited*, not last *run*.
 *
 * Reads the n8n API key from n8n-manager's secret store. The key is never printed.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const HOST = process.env.N8N_HOST ?? "https://dockerfile-1n82.onrender.com";

const secretsPath = join(homedir(), ".n8n-manager", "secrets.json");
let keys;
try {
  const secrets = JSON.parse(readFileSync(secretsPath, "utf8"));
  keys = Object.values(secrets.instanceApiKeys ?? {}).filter(
    (v) => typeof v === "string" && v.length > 20,
  );
} catch {
  console.error(`Could not read ${secretsPath}. Is n8n-as-code configured?`);
  process.exit(1);
}
if (keys.length === 0) {
  console.error("No n8n API key found in the n8n-manager secret store.");
  process.exit(1);
}

// Timer-driven or holds an open connection => costs memory continuously.
const EXPENSIVE =
  /schedule|cron|interval|emailReadImap|imap|rssFeed|pollingTrigger|gmailTrigger|googleSheetsTrigger|airtableTrigger|whatsApp|mqtt|amqp|rabbitmq|kafka|redis|postgresTrigger|localFileTrigger/i;
// Registers a route or is invoked by something else => ~free while idle.
const CHEAP =
  /webhook|formTrigger|chatTrigger|executeWorkflowTrigger|errorTrigger|trelloTrigger|jotform|typeform|stripeTrigger|calTrigger|shopifyTrigger|telegramTrigger/i;

// The instance is frequently overloaded, so a failure here is far more often a 5xx or a
// dropped connection than a bad key. Retry transient failures and report the real cause.
async function getPage(key, cursor, attempt = 1) {
  const url = new URL("/api/v1/workflows", HOST);
  url.searchParams.set("active", "true");
  url.searchParams.set("limit", "250");
  if (cursor) url.searchParams.set("cursor", cursor);
  try {
    const res = await fetch(url, {
      headers: { "X-N8N-API-KEY": key, accept: "application/json" },
      signal: AbortSignal.timeout(45_000),
    });
    if (res.status === 401 || res.status === 403) {
      const err = new Error(`HTTP ${res.status} — key rejected`);
      err.auth = true;
      throw err;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (error) {
    if (error.auth || attempt >= 3) throw error;
    console.error(`  attempt ${attempt} failed (${error.message}) — retrying…`);
    await new Promise((r) => setTimeout(r, attempt * 3000));
    return getPage(key, cursor, attempt + 1);
  }
}

async function fetchActive(key) {
  const out = [];
  let cursor;
  do {
    const body = await getPage(key, cursor);
    out.push(...(body.data ?? []));
    cursor = body.nextCursor;
  } while (cursor);
  return out;
}

let workflows;
let lastError;
for (const key of keys) {
  try {
    workflows = await fetchActive(key);
    break;
  } catch (error) {
    lastError = error;
    if (!error.auth) break; // network/5xx — a different key will not help
  }
}
if (!workflows) {
  console.error(
    lastError?.auth
      ? "n8n rejected the stored API key. Rebind it with: npx --yes n8nac env auth set Production --api-key-stdin"
      : `Could not reach n8n at ${HOST}: ${lastError?.message ?? "unknown error"}`,
  );
  process.exit(1);
}

const buckets = { expensive: [], cheap: [], unknown: [] };
for (const wf of workflows) {
  const types = [
    ...new Set(
      (wf.nodes ?? [])
        .filter((n) => /trigger|webhook|cron|interval/i.test(n.type ?? ""))
        .map((n) => (n.type ?? "").split(".").pop()),
    ),
  ];
  const row = { name: wf.name, id: wf.id, types };
  if (types.some((t) => EXPENSIVE.test(t))) buckets.expensive.push(row);
  else if (types.some((t) => CHEAP.test(t))) buckets.cheap.push(row);
  else buckets.unknown.push(row);
}

const line = (r) => `  ${r.types.join(",").padEnd(28) || "(none)".padEnd(28)}${r.id.padEnd(24)}${r.name}`;

console.log(`\nACTIVE WORKFLOWS: ${workflows.length}\n`);
console.log(`=== COSTS MEMORY CONTINUOUSLY — polling / persistent (${buckets.expensive.length}) ===`);
buckets.expensive.forEach((r) => console.log(line(r)));
console.log(`\n=== ~FREE WHILE IDLE — webhook / event driven (${buckets.cheap.length}) ===`);
console.log("Archiving these saves essentially nothing.\n");
buckets.cheap.forEach((r) => console.log(line(r)));
if (buckets.unknown.length) {
  console.log(`\n=== UNCLASSIFIED (${buckets.unknown.length}) — check by hand ===`);
  buckets.unknown.forEach((r) => console.log(line(r)));
}
console.log("");
