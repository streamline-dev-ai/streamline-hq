import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

async function loadEnv() {
  const candidates = [".env.local", ".env"];
  for (const file of candidates) {
    try {
      const txt = await readFile(file, "utf8");
      const env = {};
      for (const line of txt.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed.startsWith("#")) continue;
        const idx = trimmed.indexOf("=");
        if (idx === -1) continue;
        const key = trimmed.slice(0, idx).trim();
        let value = trimmed.slice(idx + 1).trim();
        if (value.startsWith("\"") && value.endsWith("\"")) value = value.slice(1, -1);
        env[key] = value;
      }
      return env;
    } catch {
      continue;
    }
  }
  return {};
}

const env = await loadEnv();
const url = env.VITE_SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(url, anonKey);

const seed = [
  {
    business_name: "Eddie's Electrical",
    owner_name: "Eddie",
    phone: "27832350718",
    stage: "replied",
    notes: "Sent pitch message, waiting on response to demo offer",
  },
  {
    business_name: "Will Electrical",
    owner_name: "Will",
    phone: "27646192679",
    stage: "replied",
  },
  {
    business_name: "Gifted Hands Electrical",
    phone: "27735510452",
    stage: "demo_sent",
    demo_url: "your-demo-link-here",
    notes: "Has logo. Located in Krugersdorp.",
  },
  {
    business_name: "CWC Electrical",
    owner_name: "Christiaan Coetzer",
    phone: "27845057110",
    stage: "replied",
    notes: "Afrikaans owner. Sent Afrikaans pitch.",
  },
  {
    business_name: "CR Electrical",
    owner_name: "Christiaan",
    phone: "27726152068",
    stage: "replied",
    notes: "Also Christiaan. Sent Afrikaans pitch.",
  },
  {
    business_name: "Dean Bower Electrical",
    owner_name: "Dean",
    phone: "27826864276",
    stage: "demo_sent",
    notes:
      "Restarting business after 2 years training. Said to contact in a few months. Set reminder June 2026.",
    demo_url: "your-demo-link-here",
  },
  {
    business_name: "Veri Electric Electrical Contractors",
    phone: "27828957831",
    stage: "messaged",
  },
  {
    business_name: "Kentz Electrical",
    phone: "27745545423",
    stage: "new",
  },
  {
    business_name: "Adam Electrical Services",
    owner_name: "Adam",
    phone: "27768021369",
    stage: "new",
  },
  {
    business_name: "Riakona Electrical Solutions",
    phone: "27793918482",
    stage: "new",
  },
];

const existingRes = await supabase.from("leads").select("business_name");
if (existingRes.error) {
  console.error(existingRes.error.message);
  process.exit(1);
}

const existing = new Set((existingRes.data ?? []).map((r) => (r.business_name ?? "").toLowerCase()));
const toInsert = seed.filter((s) => !existing.has(s.business_name.toLowerCase()));

if (toInsert.length === 0) {
  console.log("Seed leads already present. Nothing to insert.");
  process.exit(0);
}

const insertRes = await supabase.from("leads").insert(toInsert);
if (insertRes.error) {
  console.error(insertRes.error.message);
  process.exit(1);
}

console.log(`Inserted ${toInsert.length} leads.`);

