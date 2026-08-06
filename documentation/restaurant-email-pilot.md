# Restaurant email pilot runbook

A controlled, human-approved Zoho Mail pilot for the R699/month restaurant offer
(three-month minimum). It does not activate cold social messaging or WhatsApp
automation.

**Status: built and inactive.** The schema is live, the HQ surface ships, and all four
n8n workflows are pushed inactive. No campaign exists and nothing has been sent.

## The one rule

AI may research, draft, classify, and prepare handovers. It may not send, negotiate,
change pricing, override suppression, or reply. Every outbound email — including every
follow-up — passes through a human approval before it can be scheduled.

## Where things live

| Piece | Location |
|---|---|
| Schema + guarded RPCs | `supabase/migrations/20260804090000_restaurant_email_pilot.sql` (applied) |
| HQ surface | `/email-pilot` → `src/pages/EmailPilot.tsx`, `src/lib/emailPilot.ts` |
| CSV parse/validate (pure) | `src/lib/emailPilotCsv.ts` — verified by `npm run verify:email-import` |
| Sender | n8n `05 - Zoho Sender (Approved Queue → SMTP)` · `OU1UlkbRVW1mCcRy` |
| Inbox | n8n `06 - Zoho Inbox (IMAP → Reply Handover)` · `XqZNImewzKM5TBkr` |
| Follow-ups + 30-day close | n8n `07 - Email Pilot Follow-Ups (Business Days)` · `Eh84jFt2FF7Kb42J` |
| Failure alert + weekly report | n8n `08 - Email Pilot Health` · `qFYZcd8IfXrmUBdW` |

## Controls, and where each is enforced

Every control lives in the database, not in the workflow, so a broken or duplicated
workflow run cannot bypass it.

- **5 per day.** `claim_due_campaign_send` counts `sending` *and* `sent` rows for the
  campaign's local date. A send claimed but never recorded still holds its slot — it
  does not silently free capacity.
- **SA business hours.** The same RPC refuses to claim outside
  `business_start`–`business_end` in the campaign timezone.
- **Approved version only.** `record_campaign_provider_result` rejects a version
  mismatch. The subject is part of the approved version, not a separate field.
- **Suppression** is re-checked at membership creation, approval, scheduling, claiming,
  and reactivation. Opt-outs are permanent.
- **Idempotency.** Replaying a provider message id — outbound or inbound — returns the
  existing row instead of inserting a second one.
- **Any reply cancels pending follow-ups**, by lead and by membership.
- **Handovers** are raised for interested, question, complaint, opt-out, and unclear
  replies. Out-of-office is treated as unclear so a person judges it.
- **30 days without engagement** closes the thread. Nothing is deleted. Re-contact
  requires a new campaign and a recorded reason.

## Going live

1. In the n8n UI, open workflows 05–08 and select the credentials on each node. The API
   key currently bound to n8nac returns HTTP 403 on the credentials endpoint, so
   credential IDs could not be attached from code.
   - `05`: Send Email → **Zoho SMTP - Streamline Outreach**; the three HTTP nodes →
     a Supabase API credential holding the **service-role** key.
   - `06`: Email Trigger → **Zoho IMAP - Streamline Outreach**; HTTP nodes → Supabase;
     Telegram → your bot credential.
   - `07`, `08`: Supabase + Telegram.
2. Confirm SPF and DKIM pass for `hello@streamline-automations.co.za` and that DMARC is
   published.
3. In HQ → Email Pilot, create the campaign. It is created **inactive** and capped at 5.
4. Import a small researched list on the Import tab.
5. Approve one message for the internal test recipient only:
   `christiaansteffen12345@gmail.com`.
6. Activate workflows 05 and 06, then set the campaign `active = true`.
7. Confirm: the email arrives, `provider_message_id` and `provider_thread_id` are
   recorded, a reply from Gmail is ingested and threaded, a handover appears, and **no
   automatic reply is sent**.
8. Only then queue the 20–30 restaurant pilot. Consider raising volume after one stable
   week with no duplicate sends.

## Message shape

Drafts start from `defaultRestaurantEmail` in `src/lib/emailPilot.ts` — compliment-led,
short, honest about the R699/month three-month offer. You edit and approve every one.

The opt-out line is **not** part of the draft. The sender appends
`campaign.signature_footer` at send time so it cannot be edited away:

> If you'd rather not hear from me, just reply "no thanks" and I won't email you again.

A reply matching that phrasing classifies as `stop`, which permanently suppresses the
prospect and raises an opt-out handover.

## Rollback

Pause from HQ, or call `pause_outreach_campaign`. Claims stop immediately; the audit
trail is retained. Do not delete prospects, messages, opt-outs, or import batches.

If a row is stuck in `sending` (claimed, then the workflow died before recording), it
keeps holding a slot in that day's cap — by design. Workflow 08 alerts on it daily.
Resolve it by recording the real provider result, or by moving the row back to
`scheduled` once you have confirmed with Zoho that no mail actually went out.

## Known gaps

- Threading relies on the recipient's `In-Reply-To`/`References` headers. Workflow 06
  resolves the thread by looking the ancestor ids up in `outreach_messages`, so a reply
  to a follow-up still matches. A reply that strips those headers will not match and is
  logged as unmatched rather than guessed at.
- `streamline_hq.sa_public_holidays` is seeded through 2027. Top it up before 2028 or
  `next_sa_business_day` will schedule onto a public holiday.
