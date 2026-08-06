# Managed n8n workflows

This is the `workflowsPath` resolved by the active n8n-as-code Production environment
(`npx --yes n8nac env status --json`). These `.workflow.ts` files are the source of
truth; the raw JSON one directory above is reference scaffolding.

## Inventory

| # | Workflow | ID | Active |
|---|---|---|---|
| 01 | Lead Scraper (Google Maps → Supabase) | `Xc6658CJ1mBDzCiV` | legacy |
| 02 | WhatsApp Outreach (Queue → Evolution API) | `IT7KUALa74zLt4eh` | legacy |
| 03 | Reply Detector (Evolution API → Warm Lead Alert) | `Rbusrxa7l8Ppq1hX` | legacy |
| 04 | Gmail Follow-Up (Overdue Leads → Email) | `S2DgnXcGiZzBSRAT` | legacy |
| 05 | Zoho Sender (Approved Queue → SMTP) | `OU1UlkbRVW1mCcRy` | **inactive** |
| 06 | Zoho Inbox (IMAP → Reply Handover) | `XqZNImewzKM5TBkr` | **inactive** |
| 07 | Email Pilot Follow-Ups (Business Days) | `Eh84jFt2FF7Kb42J` | **inactive** |
| 08 | Email Pilot Health (Failures + Weekly Report) | `qFYZcd8IfXrmUBdW` | **inactive** |

01–04 are the legacy WhatsApp/Gmail Lead Engine. 05–08 are the restaurant email pilot —
see `documentation/restaurant-email-pilot.md`.

## Credentials must be selected in the UI

`npx --yes n8nac credential list` returns **HTTP 403** for the currently bound API key,
so credential IDs cannot be attached from code. Workflows 05–08 therefore ship with
their nodes wired to the right credential *type* but with no credential selected. Open
each workflow once in n8n and pick:

- **Send Email** (05) → `Zoho SMTP - Streamline Outreach`
- **Email Trigger (IMAP)** (06) → `Zoho IMAP - Streamline Outreach`
- All **HTTP Request** nodes → a Supabase API credential holding the **service-role**
  key (the pilot RPCs are granted to `service_role` only)
- All **Telegram** nodes → the Streamline bot credential

No key, token, or password is stored in this repository. Do not reintroduce the inline
placeholder keys or hardcoded bot token still present in workflow 04.

## Working on these files

```bash
npx --yes n8nac env status --json                 # resolve the effective environment
npx --yes n8nac list                              # IDs, paths, sync status
npx --yes n8nac pull <workflowId>                 # ALWAYS pull before editing
npx --yes n8nac skills node-info <nodeName>       # never guess node parameters
npx --yes n8nac skills validate <file>            # validate before pushing
npx --yes n8nac push <full-path> --verify         # push (full path, not a bare filename)
```

The email pilot workflows must stay inactive until the migration, credentials, internal
threading, suppression, and duplicate-send tests have all passed. Activation is a
deliberate human step.
