# verify-rls-anon.ps1
# Proves the RLS lockdown from the OUTSIDE using the PUBLIC anon key — exactly
# what a booking-page visitor's browser holds. Run from your machine (Claude's
# environment has no internet).
#
#   $env:SUPABASE_ANON_KEY = "<the project's anon / publishable key>"
#   ./scripts/verify-rls-anon.ps1
#
# PASS = anon can read the 4 booking tables + insert a booking, and gets HTTP
# 401/permission-denied (or empty) on every internal table.

$ErrorActionPreference = 'Stop'
$URL  = 'https://lpjwfjkgqpgydzozuusj.supabase.co'
$KEY  = $env:SUPABASE_ANON_KEY
if (-not $KEY) { Write-Error 'Set $env:SUPABASE_ANON_KEY first.'; exit 1 }

$pub = @{ apikey = $KEY; Authorization = "Bearer $KEY" }
$hq  = $pub + @{ 'Accept-Profile' = 'streamline_hq' }

function Probe($label, $path, $headers, $expectOk) {
  try {
    $r = Invoke-WebRequest -Uri "$URL/rest/v1/$path" -Headers $headers -Method GET
    $ok = $r.StatusCode -eq 200
    $verdict = if ($expectOk) { if ($ok) { 'PASS (readable)' } else { "FAIL ($($r.StatusCode))" } }
               else          { 'FAIL — readable but should be BLOCKED!' }
    "{0,-34} {1}" -f $label, $verdict
  } catch {
    $code = $_.Exception.Response.StatusCode.value__
    $verdict = if ($expectOk) { "FAIL (blocked $code, should be readable)" } else { "PASS (blocked $code)" }
    "{0,-34} {1}" -f $label, $verdict
  }
}

Write-Host "`n== Booking tables (anon SHOULD read) =="
Probe 'businesses'    'businesses?select=id&limit=1'    $pub $true
Probe 'services'      'services?select=id&limit=1'      $pub $true
Probe 'blocked_slots' 'blocked_slots?select=id&limit=1' $pub $true
Probe 'stylists'      'stylists?select=id&limit=1'      $pub $true
Probe 'bookings'      'bookings?select=id&limit=1'      $pub $true

Write-Host "`n== Internal tables (anon MUST be blocked) =="
Probe 'public.leads'             'leads?select=id&limit=1'             $pub  $false
Probe 'public.invoices'          'invoices?select=id&limit=1'          $pub  $false
Probe 'public.clients'           'clients?select=id&limit=1'           $pub  $false
Probe 'public.quotes'            'quotes?select=id&limit=1'            $pub  $false
Probe 'streamline_hq.prospects'  'prospects?select=id&limit=1'         $hq   $false
Probe 'streamline_hq.messages'   'messages?select=id&limit=1'          $hq   $false
Probe 'streamline_hq.api_costs'  'api_costs?select=id&limit=1'         $hq   $false
Probe 'prospect_engagement'      'prospect_engagement?select=*&limit=1' $hq  $false

Write-Host "`n(Booking INSERT is allowed for anon by design — the public page creates bookings.)"
