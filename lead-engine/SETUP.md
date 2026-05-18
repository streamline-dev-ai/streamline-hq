# Lead Engine — Setup Runbook

Status as of 2026-05-18. The full strategy is in the original plan doc; this
is the actionable checklist.

## ✅ Done (in code, by me)

- **Supabase `streamline_hq` schema applied & verified** on project
  `lpjwfjkgqpgydzozuusj`: tables `prospects, gap_analyses, demos, messages,
  replies, approval_queue, api_costs` + the D+4/10/18 auto-follow-up trigger
  + indexes. RLS disabled (consistent with the rest of this single-operator
  setup — revisit before any multi-user use). SQL is in
  `lead-engine/schema.sql` for reference/reproducibility.

## ⛔ What I CANNOT do from here (needs you — external accounts/infra)

These need accounts, API keys, or services I can't create or run from code:

1. **Dedicated outreach SIM** — buy a ~R99 prepaid, register it, leave it
   48h before linking to Evolution. Caps ban blast-radius.
2. **Telegram bot** — @BotFather → `/newbot` → name "StreamlineLeadBot" →
   copy token. Get your chat_id from @userinfobot.
3. **Apify account** — sign up (free $5/mo credit), copy API token. Actors:
   `compass/crawler-google-places`, `apify/instagram-hashtag-scraper`,
   `apify/instagram-profile-scraper`.
4. **Anthropic API key** — for Haiku 4.5 (gap analysis) + Sonnet 4.6 (message
   drafting). Enable prompt caching on the system prompts (90% cheaper).
5. **n8n** — host on Render free tier; add a cron-job.org 5-min keep-alive
   ping. Build the 5 workflows (A lead-intake, B enrich-and-draft, C
   approval-handler, D send-loop, E reply-handler) — node maps are in the
   plan doc §4.
6. **Evolution API** — already on Railway per the plan; scan the outreach
   SIM's WhatsApp QR into it.
7. **Demo app** — ONE Next.js 14 app on Vercel serving `/demo/[slug]` from
   the `streamline_hq.demos` table (NOT per-prospect deploys). Plan §6.

## Order to set it up (each unblocks the next)

SIM → (Supabase ✅) → Telegram bot → Apify token → Anthropic key →
n8n + Workflow A (Google Maps only, no AI) → validate 50 real prospects
in `streamline_hq.prospects` → Workflow B (Haiku gap + Sonnet draft) →
demo app → Workflow C+D (Telegram approve + Evolution send) →
Workflow E (replies) → follow-ups + POPIA 30-day delete cron.

## Claude prompts

Prompts 1–4 (gap analysis JSON schema, WhatsApp draft, reply sentiment,
follow-ups) are specified verbatim in the plan doc §5 — use them as-is;
they're tuned for SA beauty-business tone + the Streamline tier system.

## POPIA (non-negotiable)

Opt-out line in every first message; auto-honour STOP within 1 min
(Workflow E); 30-day delete of dead prospects; keep a simple ROPA doc.

## Next codeable step (I can do this)

The **Lead Engine admin screens** inside streamline-admin (Dashboard,
Approval Queue, Pipeline, Inbox, Prospect Detail) reading/writing the
`streamline_hq` tables — a redundant surface to the Telegram approval
flow. Say the word and I'll build it against the live schema.
