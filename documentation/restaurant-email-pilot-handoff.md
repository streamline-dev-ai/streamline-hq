# Restaurant Email Pilot — Claude Code Handoff

## Objective

Build a controlled, email-first restaurant outreach MVP using Zoho Mail for Streamline Automations' R699/month restaurant website offer with a three-month minimum.

Pilot constraints:

- Maximum five emails per South African business day.
- Every outbound message requires human approval.
- Every reply requires human review; never auto-reply during the pilot.
- WhatsApp remains fully manual.
- Instagram and Facebook remain researched, manually sent queues only.
- AI may research, summarise evidence, draft messages, classify replies, and prepare handovers. AI cannot send, negotiate, change pricing, override suppression, or reply automatically.

## Current State — 5 August 2026 (build session complete)

The build described below has been carried out. `documentation/restaurant-email-pilot.md`
is now the operational source of truth; this file is kept as the original brief plus the
delta below.

### Done in this session

- Reviewed `20260804090000_restaurant_email_pilot.sql` against the live schema and fixed
  four defects before applying it:
  - **Daily-cap leak.** `claim_due_campaign_send` counted only `sent_at`, so a row
    claimed but never recorded (`sending`, `sent_at IS NULL`) freed its slot permanently
    and let the campaign exceed 5/day. It also compared dates in the session timezone
    rather than the campaign's. Now counts `coalesce(sent_at, sending_claimed_at)` in the
    campaign timezone. Verified: 10 claim attempts against a 5-cap campaign with a stuck
    `sending` row granted exactly 5.
  - **No subject line existed anywhere.** Added `subject` through
    `campaign_memberships`, `outreach_approval_versions`, `outreach_messages`, and the
    approve/claim/record RPCs, so the approved version covers the subject too.
  - **No follow-up or holiday schema** despite delivery step 8. Added
    `sa_public_holidays` (seeded 2026–2027), `next_sa_business_day`,
    `queue_campaign_follow_up`, and `close_stale_campaign_members`.
  - **`suppression_list` had no unique constraint on `prospect_id`**, so the opt-out
    path's `on conflict do nothing` was a silent no-op. Added (no duplicates existed).
- Applied the migration to `lpjwfjkgqpgydzozuusj` and verified tables, indexes, RLS,
  grants, and all 14 RPC signatures. Supabase default privileges had granted `EXECUTE`
  to `authenticated` on creation, so the sender/inbox RPCs were revoked from it by name —
  `claim_due_campaign_send`, `record_campaign_provider_result`, `ingest_campaign_reply`,
  and `close_stale_campaign_members` are now `service_role` only.
- Ran the full invariant suite against production with disposable fixtures, then removed
  every test row (prospect count returned to its original 276).
- Built the HQ surface at `/email-pilot` (import, approve, threads, handovers, social,
  report).
- Authored and pushed workflows 05–08, all `active: false`, all verified clean. Existing
  workflows 01–04 were left untouched.
- `npm run check`, `npm run lint`, `npm run build`, and `npm run verify:email-import`
  all pass.

### Decisions taken

- **Opt-out:** one-line human footer appended by the sender from
  `campaign.signature_footer`, not editable in the draft.
- **Test recipient:** `christiaansteffen12345@gmail.com` only.
- **Follow-ups re-enter the approval path** on the same membership rather than sending
  on their own, so they consume the same daily cap and still need a human approval.

### Still outstanding

- Select credentials on workflows 05–08 in the n8n UI (the bound API key returns 403 on
  the credentials endpoint, so IDs could not be attached from code).
- Confirm SPF/DKIM/DMARC for the sender domain.
- Create the campaign, run the internal test send, then activate.
- **Rotate the n8n API key** — it was pasted into a prior chat.

### Original brief — completed before this session

- Production n8n environment is bound through n8nac and API access was verified.
- Effective n8n workflows path: `lead-engine/n8n/managed`.
- Four existing Lead Engine workflows were pulled and are tracked:
  - `01 - Lead Scraper (Google Maps → Supabase)`
  - `02 - WhatsApp Outreach (Queue → Evolution API)`
  - `03 - Reply Detector (Evolution API → Warm Lead Alert)`
  - `04 - Gmail Follow-Up (Overdue Leads → Email)`
- Existing workflows were audited. They are legacy/reference workflows and are not the new controlled Zoho pilot.
- Zoho credentials were created by the user inside n8n:
  - `Zoho SMTP - Streamline Outreach`
  - `Zoho IMAP - Streamline Outreach`
- Planned sender alias: `hello@streamline-automations.co.za`.
- Display name: `Christiaan | Streamline Automations`.
- Reply-to: `christiaan@streamline-automations.co.za`.
- Database foundation migration created at `supabase/migrations/20260804090000_restaurant_email_pilot.sql`.
- Operating runbook created at `documentation/restaurant-email-pilot.md`.
- Before the latest handoff, `npm run check` and `npm run build` passed.

### Not completed

- The restaurant email pilot migration has not been applied to production Supabase.
- Production schema/RPC verification has not been run.
- No Zoho SMTP sender workflow has been authored or pushed.
- No Zoho IMAP inbox workflow has been authored or pushed.
- No research/drafting, follow-up, failure-alert, or weekly-report workflow has been added for this pilot.
- No email import/approval campaign interface has been added to Streamline HQ.
- No campaign has been created or activated.
- No internal test email or marketing email has been sent.

## Database Foundation

The additive migration creates or extends:

- `streamline_hq.outreach_campaigns`
- `streamline_hq.campaign_memberships`
- `streamline_hq.outreach_approval_versions`
- `streamline_hq.import_batches`
- `streamline_hq.import_row_results`
- `streamline_hq.outreach_handovers`
- Provider message/thread fields on canonical `public.outreach_messages`

Guarded RPCs:

- `create_campaign_membership`
- `approve_campaign_message`
- `schedule_campaign_message`
- `claim_due_campaign_send`
- `record_campaign_provider_result`
- `ingest_campaign_reply`
- `pause_outreach_campaign`
- `manually_reactivate_campaign_member`

Required invariants:

- Suppression must be checked before membership creation, approval, scheduling, claiming, and reactivation.
- Only the exact approved message version may be scheduled and sent.
- Send claiming must be atomic and enforce the campaign daily cap.
- Campaigns default inactive and daily limit defaults to five.
- Provider callbacks and inbound replies must be idempotent.
- Any reply cancels pending follow-ups.
- Interest, complaints, opt-outs, questions, and uncertain replies create human handovers.
- Opt-outs remain permanently suppressed.
- After 30 days without engagement, close but do not delete the lead.
- Re-contact requires a new campaign and a recorded manual reason.

Before applying, review the migration against the live schema. Preserve the canonical CRM tables and do not revive the legacy `streamline_hq.messages`, `replies`, or `approval_queue` tables.

## Required Delivery Sequence

1. Verify the live Supabase project/link and migration history.
2. Review `20260804090000_restaurant_email_pilot.sql` for compatibility with the live schema.
3. Apply the migration through the repository's supported Supabase migration path.
4. Verify tables, indexes, RLS, grants, and all RPC signatures against production.
5. Build the Streamline HQ email campaign/import/approval surface.
6. Build an inactive Zoho sender workflow:
   - Trigger during configured SA business hours.
   - Call `claim_due_campaign_send`.
   - Stop cleanly when no row is claimed.
   - Send through `Zoho SMTP - Streamline Outreach` only after a successful claim.
   - Record the exact approved version and provider result through `record_campaign_provider_result`.
   - Retry transient errors only; record permanent failures.
7. Build an inactive Zoho inbox workflow:
   - Use `Zoho IMAP - Streamline Outreach`.
   - Deduplicate by provider message ID.
   - Preserve the provider thread relationship and complete message body.
   - Classify but never auto-reply.
   - Call `ingest_campaign_reply` and create immediate human handovers where required.
8. Add business-day follow-ups excluding weekends and configured South African public holidays.
9. Add daily failure alerts and weekly pipeline reporting.
10. Validate and push each new workflow inactive.
11. Test internal addresses only after explicit confirmation of the test recipients.
12. Do not activate live sending until the migration, credentials, internal threading, suppression, and duplicate-send tests pass.

## Streamline HQ Requirements

- CSV email import with row validation, normalisation, duplicate review, suppression checks, and batch results.
- Evidence-backed scoring and research cards.
- Five-item daily approval queue.
- Approve, edit, skip, suppress, research-again, pause-campaign, and handover actions.
- Provider delivery state, email/thread timeline, reply classification, and follow-up state.
- Weekly pipeline report.
- Separate Instagram/Facebook queue with verified profile URLs and suggested manual text.
- Social manual sends log into the same lead history.

Preserve the existing dark, glassy, purple/orange Streamline HQ design direction and mobile-aware component conventions.

## Test Requirements

- Import valid, invalid, duplicate, missing-contact, and suppressed rows; valid rows must survive partial failures.
- Verify suppression at every guarded boundary.
- Verify exact approved-version enforcement.
- Verify global/campaign pause and five-per-day cap under concurrent claims.
- Simulate transient SMTP failures, hard bounces, malformed inbound mail, duplicate inbound events, threading, opt-outs, complaints, referrals, out-of-office replies, and unclear replies.
- Verify replies cancel future follow-ups.
- Verify interested replies create a handover within five minutes.
- Verify no automated reply is sent.
- Verify SA business-day scheduling and public-holiday exclusion.
- Run internal test addresses first, followed by a manually approved 20–30 restaurant pilot.
- Consider increasing volume only after one stable week with no duplicate sends.

## Security and Operational Notes

- Read `AGENTS.md` and `.agents/skills/n8n-architect/SKILL.md` before n8n work.
- Resolve the live environment with `npx --yes n8nac env status --json` before workflow commands.
- Pull before editing existing workflows.
- Use n8n node schemas; never guess node parameters.
- Never commit or print the n8n API key, Zoho app password, SMTP password, IMAP password, Supabase service-role key, or database password.
- The n8n API key was pasted into the prior chat and should be rotated and rebound after the build is complete.
- Credential metadata listing previously returned HTTP 403 for the supplied n8n API key. The credential names above were confirmed directly by the user.
- Do not reuse unrelated SMTP credentials or unrelated bulk-email workflows.
- Preserve the dirty worktree and all unrelated user changes.

## Recommended Claude Model

Use Opus for the initial live-schema review, migration application, RLS/RPC audit, and n8n sender/inbox architecture. This work crosses production data integrity, concurrent send claiming, credential wiring, idempotency, and deliverability controls.

Sonnet is suitable after the architecture is settled for focused UI components, straightforward tests, documentation updates, and small workflow adjustments.

