# Lead Engine — n8n workflows

Importable workflow JSON. In n8n: **Workflows → ⋯ → Import from File**.

## Manual-send model (no automated WhatsApp)

**Every WhatsApp is sent manually from Christiaan's own phone.** No workflow calls
Evolution (or any API) to send. The system's only job is to *draft* the message and
hand back a one-tap **`https://wa.me/<digits>?text=<urlencoded>`** send-link in Telegram.
Tapping it opens WhatsApp with the message pre-typed to that lead; you review + send.

The Evolution send-loop (**D**) and the auto reply-handler (**E**) are **retired** and
moved to [`_archived/`](./_archived) (kept for reference, not deployed). **Evolution API
is no longer used for sending anything.**

## What's here (active)

| File | What it does |
|---|---|
| `workflow-A-lead-intake.json` | Cron / POST `/webhook/lead-engine-intake` → Apify Google Maps → normalize/slugify/E.164 → upsert `prospects`. |
| `workflow-B-control-card.json` | Webhook (`/webhook/lead-engine-enrich`, prospect_id) → suppression check → posts a **per-prospect Telegram control card** with inline buttons: Cold A / Cold B / build+deliver / Day-4 / Day-10 / opt-out. |
| `workflow-C-control-handler.json` | Telegram callback hub. Parses `<action>_<prospect_id>`, re-checks suppression, then: renders the **tap-to-send wa.me link** for the cold/follow-up messages; runs **B2** on "said YES"; on "opt-out" sets `prospects.status=dead` + `popia_optout=true`, inserts `suppression_list`, and cancels pending follow-ups. |
| `workflow-B2-build-deliver.json` | `executeWorkflowTrigger` (fired by C's build button) → creates business + niche services + SHA-256 PIN → booking + admin links → **Telegram delivery send-link** (no auto-send). |
| `workflow-F-booking-engagement.json` | Booking webhook → `prospect_engagement` → if real bookings (and not suppressed), drafts the tiered upgrade pitch + 7-day guarantee → **Telegram upgrade send-link**. Stays auto-detected, manual-send. **The killer follow-up.** |

These are **valid, importable scaffolds**: every `SET_*` value is a placeholder you replace
once after import. Inline-keyboard nodes especially may need a quick check in the n8n UI —
paste any import error back and I'll fix the JSON.

### Cold message copy (POPIA-compliant, deterministic)
Message 1 is a one-time **consent request**, not a hard pitch: it names Christiaan +
Streamline Automations, links the showcase demo
(`?biz=showcase-lash-studio`), and always includes a `reply STOP` opt-out line. Two variants
you pick per send: **Cold A** (offer-led) and **Cold B** (pain-led: "saw you take bookings by
DM/WhatsApp — want a free page that does it automatically?"). All copy is temp-0 template-fill
(first name + business name only), no emojis, no fake testimonials.

## Replace these placeholders (use n8n Variables or edit the nodes)

- `SET_SUPABASE_URL` → `https://lpjwfjkgqpgydzozuusj.supabase.co`
- `SET_SUPABASE_SERVICE_KEY` → the unified project's **service_role** key
  (Supabase → Project Settings → API). Server-side only — n8n is fine.
- `SET_ANTHROPIC_API_KEY` → your Anthropic key
- `SET_TELEGRAM_CHAT_ID` → your chat id (from @userinfobot); attach a
  Telegram credential to every Telegram node (and to C's Telegram **Trigger**)
- `SET_B2_WORKFLOW_ID` (in C) → auto-filled by `deploy.mjs` when B2 imports
  first; otherwise set C's "Run B2 Build" node to the B2 workflow by hand.

Evolution API placeholders are gone — sending is manual now.

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
node deploy.mjs            # import/upsert A, B2, B, C, F
node deploy.mjs --test-f   # also safe-test F (no WhatsApp sent)
```

Nothing sends WhatsApp. Telegram nodes (and C's Telegram **Trigger**) still
need their credential attached once in the n8n UI. Paste the full console
output back to Claude to iterate.

## Pipeline gating

The control card (**B**) should be fired only for prospects worth contacting.
The qualifier (see `../qualifier/`) sets `prospects.lead_temp`; only
`hot`/`warm` prospects that are **not** in `suppression_list` get a card.
`cold`/`unknown` are parked for manual review. Every workflow also re-checks
suppression immediately before generating a wa.me link, so an opt-out is
honoured even mid-sequence.

## Retired

- **D — send-loop** (Evolution send) → `_archived/`
- **E — reply-handler** (Evolution inbound) → `_archived/`

Evolution API is no longer part of the pipeline. The old approve/kill
handler and the Claude-drafted cold message also moved to `_archived/`
(replaced by the deterministic control card + handler above).
