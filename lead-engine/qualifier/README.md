# Lead Qualifier

Classifies every prospect in `streamline_hq.prospects` by whether they **already
have a website and/or an online booking system** — because the whole pitch only
lands on businesses that *don't*. Outreach (the Workflow-B control card) then fires
only for `hot`/`warm` prospects that aren't suppressed; `cold`/`unknown` are parked.

## Buckets (`prospects.lead_temp`)

| temp | meaning | source |
|---|---|---|
| `hot` | no website, or social / link-in-bio only (facebook, instagram, linktr.ee, beacons, wa.me, …) | best target |
| `warm` | has a real website but **no** online booking system | strong target |
| `cold` | already has a booking system (Fresha, Booksy, Treatwell, Acuity, Calendly, Setmore, SimplyBook, GlossGenius, Vagaro, Timely, Schedulicity, Picktime, 10to8, vcita, Square Appointments) | skip — `booking_platform` records which |
| `unknown` | site exists but couldn't be fetched/parsed (timeout, DNS, TLS, blocked, redirect loop) | parked for manual review |

`wa.me` / WhatsApp-only "booking" does **not** count as a booking system.

It also sets `has_website`, `has_booking_system`, `booking_platform`, `qualified_at`.

## Files

- **`classify.mjs`** — pure classification logic (no network/DB). Single source of truth.
- **`qualify.mjs`** — fetches each site fail-safe and writes results back to Supabase.
- **`import-csv.mjs`** — imports a Phantombuster/Apify CSV into `prospects`, then qualifies the new rows.
- **`../n8n/workflow-G-qualifier.json`** — the same logic as an n8n workflow (read → loop → fetch → classify → update), for running inside n8n.

## Run it (from your machine — this needs internet)

```powershell
$env:SUPABASE_URL="https://lpjwfjkgqpgydzozuusj.supabase.co"
$env:SUPABASE_SERVICE_KEY="<service_role key>"

# Qualify everyone not yet qualified
node qualify.mjs
node qualify.mjs --all          # re-qualify everything
node qualify.mjs --limit 50
node qualify.mjs --ids id1,id2

# Import a CSV (auto-qualifies the new rows)
node import-csv.mjs ./leads.csv
node import-csv.mjs ./leads.csv --niche "nail salon"   # default niche for blank cells
node import-csv.mjs ./leads.csv --no-qualify           # import only
```

CSV columns are matched loosely (case/spacing-insensitive). Recognised aliases:
`business_name` (name/title/company), `website` (url/site/domain), `phone`
(phonenumber/tel/mobile → normalised to 27…), `niche` (category/type), `suburb`
(area/city), `instagram`, `google_rating` (rating/totalScore/stars), `source`.
De-dupes on `slug`; existing prospects are skipped, not overwritten.

## Safety

- 8s per-request timeout, follows redirects, normal browser User-Agent.
- ~1 request/second; **no retries**; a fetch failure never crashes the run — that
  row becomes `lead_temp='unknown'` and is parked.
- All DB writes use the service-role key (server-side only — never ship it to a browser).

## Keep in sync

`../n8n/workflow-G-qualifier.json`'s "Qualify All" Code node embeds a copy of the
`classify.mjs` logic (n8n can't import local files). If you change the booking
signatures or social hosts in `classify.mjs`, mirror them there.
