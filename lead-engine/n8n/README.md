# Lead Engine — n8n workflows

Importable workflow JSON. In n8n: **Workflows → ⋯ → Import from File**.

## What's here

| File | What it does | Status |
|---|---|---|
| `workflow-F-booking-engagement.json` | Webhook (from booking) → check `prospect_engagement` → if real bookings, Claude drafts the hot upsell → insert as `pending_approval` → Telegram alert. **The killer follow-up.** | Importable scaffold |
| `workflow-D-send-loop.json` | Every 5 min → pull `approved` messages (step 99 first) → human delay → Evolution send → mark `sent` (DB trigger then schedules D+4/10/18). | Importable scaffold |

These import cleanly and have the correct node graph. They are **scaffolds**: every `SET_*` value is a placeholder you replace once, in n8n, after import.

## Replace these placeholders (use n8n Variables or edit the nodes)

- `SET_SUPABASE_URL` → `https://lpjwfjkgqpgydzozuusj.supabase.co`
- `SET_SUPABASE_SERVICE_KEY` → the unified project's **service_role** key
  (Supabase → Project Settings → API). Server-side only — n8n is fine.
- `SET_ANTHROPIC_API_KEY` → your Anthropic key
- `SET_TELEGRAM_CHAT_ID` → your chat id (from @userinfobot); attach a
  Telegram credential to the Telegram node
- `SET_EVOLUTION_URL` / `SET_EVOLUTION_INSTANCE` / `SET_EVOLUTION_API_KEY`
  → your Evolution API instance

Note: Supabase REST reaches the `streamline_hq` schema via the
`Accept-Profile` / `Content-Profile: streamline_hq` headers (already set
in the nodes) — that schema is API-exposed.

## Deploy + safe-test from YOUR machine (`deploy.mjs`)

Claude's environment has no internet, so you run this; it makes the API
calls, you paste the output back for Claude to read & fix.

```powershell
cd C:\Users\User\Documents\trae_projects\streamline-admin\lead-engine\n8n
$env:N8N_URL="https://dockerfile-1n82.onrender.com"
$env:N8N_API_KEY="<n8n -> Settings -> n8n API -> Create API key>"
$env:SUPABASE_URL="https://lpjwfjkgqpgydzozuusj.supabase.co"
$env:SUPABASE_SERVICE_KEY="<unified project service_role key>"
$env:ANTHROPIC_API_KEY="<key>"
$env:TELEGRAM_CHAT_ID="<your chat id>"
node deploy.mjs            # import/upsert workflow F + D
node deploy.mjs --test-f   # also safe-test F (no WhatsApp sent)
```

Never activates the send-loop, never sends WhatsApp. The Telegram node
still needs its credential attached once in the n8n UI. Paste the full
console output back to Claude to iterate.

## Still to build (bigger / more environment-specific — see ../SETUP.md)

- **A — lead-intake** (Apify Google Maps/IG → dedupe → insert prospects)
- **B — enrich-and-draft** (Claude Haiku gap analysis → demo/booking page
  decision → Claude Sonnet draft → Telegram approve)
- **C — approval-handler** (Telegram callback → approve/edit/kill)
- **E — reply-handler** (Evolution inbound → Claude sentiment → route)

These depend heavily on your Apify actors, exact Claude prompts (plan §5),
and Evolution webhook shape, so they're documented step-by-step in
`../SETUP.md` rather than shipped as guess-work JSON. Ask and I'll generate
any of them next once the accounts above exist.
