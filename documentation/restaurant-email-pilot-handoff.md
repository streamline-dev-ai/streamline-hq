# Restaurant Email Pilot — current state

Baton for the next session. Operational detail lives in
`documentation/restaurant-email-pilot.md`; this file is only "where we are".

Last updated: 12 August 2026.

## The objective

Controlled Zoho Mail outreach for the R699/month restaurant website offer, three-month
minimum. **Max 5 emails per SA business day. Every outbound human-approved. Every reply
human-reviewed. Never auto-reply.** AI may research, draft, classify and prepare
handovers — it may not send, negotiate, price, or override suppression. WhatsApp stays
manual; Instagram/Facebook are researched queues sent by hand.

## Built and working

- **Schema applied to production** (`lpjwfjkgqpgydzozuusj`), migrations
  `20260804090000_restaurant_email_pilot.sql` and
  `20260809160000_email_pilot_schedule_without_active_campaign.sql`.
  Controls live in the database, not the workflow: daily cap, business hours,
  suppression at five boundaries, exact-approved-version enforcement, idempotent
  provider IDs, reply-cancels-follow-ups, 30-day close. All verified against production
  with disposable fixtures, since removed.
- **HQ surface** at `/email-pilot` — import, approve, threads, handovers, social, report.
  Deployed to Vercel (`5648951`).
- **n8n workflows 05–08** pushed, credentials attached, verified in sync.
  - `05 - Zoho Sender` `OU1UlkbRVW1mCcRy` — **active**, runs every 15 min, succeeds,
    correctly claims nothing while the campaign is paused. Its success proves the
    Supabase service-role credential works.
  - `06 - Zoho Inbox` `XqZNImewzKM5TBkr` — inactive
  - `07 - Follow-Ups` `Eh84jFt2FF7Kb42J` — inactive
  - `08 - Health` `qFYZcd8IfXrmUBdW` — inactive
- `npm run verify:email-import` — 17 checks on CSV parsing/validation.
- DNS verified live: SPF, DKIM (`zoho` selector), DMARC, MX all correct.

## Where it is parked

| | |
|---|---|
| Campaign | exists, `active: false`, **paused** |
| Test email | queued `scheduled` since 9 Aug, to `christiaansteffen12345@gmail.com` |
| Emails ever sent | **0** |
| Prospects with an email address | **3 of 276** |

## Next actions, in order

1. **Send the internal test.** HQ → Email Pilot → Approve tab → **Activate sending**
   (hard-refresh first; it's a PWA and the service worker caches the old bundle).
   Then activate `06 - Zoho Inbox` in n8n. Confirm the mail arrives, reply from Gmail,
   and check a handover appears with **no auto-reply**.
2. **Source restaurant email addresses.** This is the real blocker — only 3 of 276
   prospects have one, and the Google Maps scraper does not return emails. Likely path:
   harvest `info@`/`hello@` from the prospects' own websites.
3. **Then** import 20–30 restaurants and work the daily queue.

## Known gaps

- `sa_public_holidays` is seeded through 2027 only.
- Threading depends on the recipient's `In-Reply-To`/`References`; a reply that strips
  them is logged as unmatched rather than guessed at.
- Rotate the n8n API key — it was pasted into an early chat.

## n8n instance health (separate problem)

Render instance `dockerfile-1n82.onrender.com` OOM-crashes on boot.

Diagnosed: **not** a workflow-count problem. Of 68 active workflows, **64 are plain
webhooks** costing ~zero while idle; only 3 poll. Archiving or deleting old workflows
saves essentially nothing. n8n's baseline footprint is 300–400MB, so a 512MB plan has no
headroom for a single execution.

Done: deactivated a duplicate `Trello LAYOUTS BUSY (Colliné)` (`hbNuUffyTEYzvVFW`, was
double-firing) and `Stock Orders` (`q7u8NKLXbxzJL6AP`, webhook path collision causing an
infinite activation retry loop).

Outstanding, all on Render and requiring the account owner:

```
# the actual fix: upgrade the plan to 2GB, then
NODE_OPTIONS=--max-old-space-size=1536
N8N_CONCURRENCY_PRODUCTION_LIMIT=5
EXECUTIONS_DATA_PRUNE=true
EXECUTIONS_DATA_MAX_AGE=72
EXECUTIONS_DATA_PRUNE_MAX_COUNT=2000
EXECUTIONS_DATA_SAVE_ON_SUCCESS=all
EXECUTIONS_DATA_SAVE_ON_ERROR=all
EXECUTIONS_DATA_SAVE_ON_PROGRESS=false
EXECUTIONS_DATA_SAVE_MANUAL_EXECUTIONS=false
```

## Accounts

- Supabase dashboard: sign in with **GitHub**; account email
  `streamline.automations.hq@gmail.com`. Project `streamline-admin`
  (`lpjwfjkgqpgydzozuusj`) — not `Reckless-Admin`.
- Streamline HQ app login: `christiaansteffen12345@gmail.com` (only auth user).
  No password-reset UI — use the Supabase dashboard's magic link.
- n8n credentials API returns 403 for the bound key; use the n8n MCP server instead,
  which has full credential scope.
