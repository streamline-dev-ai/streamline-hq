# Streamline HQ — Trae Context

This file captures the important decisions, features, and operational notes for continuing development in a new Trae chat.

## Project
- Repo: https://github.com/streamline-dev-ai/streamline-hq
- App: Vite + React + Tailwind, dark theme (`#09090b` base, `#8b5cf6` accent).
- Backend: Supabase (Postgres + realtime).
- Deploy: Vercel (SPA rewrite + `/api/*` serverless functions).

## Environment Variables
Frontend (Vite):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Server (recommended for AI):
- `GOOGLE_API_KEY` (Gemini API key)

Notes:
- Do NOT commit API keys into the repo.
- The client has a fallback that can use `VITE_GOOGLE_API_KEY` / `VITE_GEMINI_API_KEY`, but that exposes the key in the browser and is not recommended.

## Routes
- `/today`: daily operating view + follow-ups due section.
- `/leads`: active leads pipeline (minimal cards) + analytics tab.
- `/messages`: message templates module.
- `/clients`: leads marked as clients.

## Leads Model (Supabase: `public.leads`)
Core columns used by the UI:
- `business_name` (required)
- `owner_name`, `phone`, `email`, `niche`, `demo_url`, `notes`
- `stage` (enum-like text check: new/messaged/replied/demo_sent/proposal_sent/closed/lost)
- `last_contact_at` (timestamptz)
- `is_client` (boolean) — determines whether it is a Lead vs Client
- `follow_up_due` (date) and `follow_up_type` (text) — reminders

Active leads definition:
- Active Leads = `is_client = false OR is_client IS NULL`
- Clients = `is_client = true`

## Follow-up Reminder System
DB columns:
- `follow_up_due date`
- `follow_up_type text`

Auto scheduling when stage changes (implemented in `/leads` stage dropdown handler):
- Stage `messaged` -> due = today + 3 days, type = `no_reply_check`
- Stage `demo_sent` -> due = today + 1 day, type = `demo_check_in`
- Stage `proposal_sent` -> due = today + 2 days, type = `proposal_follow_up`
- Stage `closed` or `lost` -> clears follow-up fields

Manual override:
- In the lead detail drawer there is a date picker to set/clear `follow_up_due`.

UI:
- `/leads` card shows orange "Follow up due" badge when `follow_up_due <= today` and stage not closed/lost.
- `/today` shows "Follow-ups due today" at the very top.

## `/today` — Follow-ups due today
Query behavior:
- Leads where `follow_up_due <= today`, stage not in (`closed`,`lost`), and active leads only.

Actions:
- "Open lead" -> navigates to `/leads?lead=<id>&tab=messages` and opens the drawer directly on Messages tab.
- "Done" -> clears follow-up and sets `last_contact_at = now()`.

## `/leads` — Simplified cards + full drawer workspace
Card surface intentionally minimal:
- Stage dropdown (most-used)
- "Message" button (opens detail drawer to Messages tab)

Everything else moved into the drawer.

Drawer (LeadDetailsDrawer):
- Tabs: Details / Messages
- Details: contact links, demo link copy, Copy opener, Suggest reply (Gemini), Log contact, Mark as client, Follow-up date, notes, stage timeline.
- Messages: full message history + Add message box.

## Message history policy (important)
We removed auto-inserted “fake” messages.
- The app does NOT auto-write to `outreach_messages` when you copy openers/templates/AI text.
- Only messages you manually add via the drawer are stored.

Cleanup script (one-time use):
- `pnpm run cleanup:auto-messages` deletes rows where `template_id` is `opener` or `ai_suggest`.

## Message Templates Module (`/messages`)
Supabase table: `public.message_templates`
Columns used:
- `id, name, stage, language, text, send_count, reply_count`

UI behavior:
- Templates grouped by stage buckets.
- Variables like `{{business_name}}` highlighted in purple; modal prompts for values before copying.
- Copy & Track copies to clipboard and increments `send_count`.
- Edit modal updates template text.

Lead context:
- Selecting a lead (opening its drawer) sets an "active lead" context for variable prefill in `/messages`.

## AI Suggest Reply (Gemini)
Where:
- Inside lead drawer (not on card).

How:
- Calls `/api/gemini-suggest` serverless route (recommended) which reads `GOOGLE_API_KEY` from server env.
- Prompt generates a short, casual WhatsApp message (<= 3 sentences).
- UI allows regenerate + copy.

Files:
- Serverless handler: `api/gemini-suggest.ts`
- Client helper: `src/lib/gemini.ts`

## Realtime
- Uses Supabase realtime subscriptions on `leads` and other tables to refresh lists without manual reload.

## Migrations added
- `supabase/migrations/create_lead_stage_events.sql` (stage timeline events)
- `supabase/migrations/add_is_client_to_leads.sql`
- `supabase/migrations/add_followup_to_leads.sql`

## Scripts
- `pnpm run seed:leads` — inserts example leads if missing.
- `pnpm run cleanup:auto-messages` — removes auto-inserted outreach_messages.

## Deployment notes (Vercel)
- Ensure Vercel env vars are set:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `GOOGLE_API_KEY`

## Next big feature requested (not built yet)
Niche Manager + Daily Outreach Queue (`/outreach`), with new tables `niches` and `lead_queue`, queue generation logic, import flow, and analytics.

## Buffer Integration (Content Module)
The Buffer API doesn't support programmatic media uploads. The workflow is:

1. Create post in Streamline with captions/hashtags
2. Schedule or Post Now → saves to Supabase + creates text-only post in Buffer
3. Click "Open Buffer" → goes to buffer.com/app/posts/
4. Manually add images to scheduled posts in Buffer

Environment variables needed:
- `VITE_BUFFER_API_KEY` - Buffer API token
- `VITE_BUFFER_INSTAGRAM_ID` - Instagram channel ID
- `VITE_BUFFER_FACEBOOK_ID` - Facebook channel ID  
- `VITE_BUFFER_LINKEDIN_ID` - LinkedIn channel ID

Files:
- `src/services/bufferService.ts` - Client-side Buffer integration
- `supabase/functions/buffer-proxy/index.ts` - Edge function proxying to Buffer GraphQL API

