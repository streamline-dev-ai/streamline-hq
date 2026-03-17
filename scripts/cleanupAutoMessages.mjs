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

const res = await supabase
  .from("outreach_messages")
  .delete()
  .in("template_id", ["opener", "ai_suggest"]);

if (res.error) {
  console.error(res.error.message);
  process.exit(1);
}

console.log("Deleted auto-inserted outreach_messages rows (template_id opener/ai_suggest)." );
