// classify.mjs — pure lead-qualification logic (no network, no DB).
// Single source of truth, shared by qualify.mjs, import-csv.mjs and the n8n
// workflow-G Code node (keep that copy in sync with this file).
//
// Buckets:
//   hot     — no website at all (or social/link-in-bio only). Best target.
//   warm    — has a website but NO online booking system.
//   cold    — already has an online booking system (skip; that's our pitch gone).
//   unknown — site exists but couldn't be fetched/parsed (parked for manual review).

// Social / link-in-bio hosts that do NOT count as "having a website".
export const SOCIAL_HOSTS = [
  "facebook.com", "m.facebook.com", "fb.me", "fb.com",
  "instagram.com", "instagr.am",
  "linktr.ee", "linktree.com", "beacons.ai", "linkin.bio",
  "msha.ke", "carrd.co", "taplink.cc", "lnk.bio", "campsite.bio",
  "wa.me", "api.whatsapp.com", "tiktok.com", "x.com", "twitter.com",
];

// Known online-booking platforms and the signatures that identify them.
// Order matters only for which name we report first; all are checked.
export const BOOKING_SIGNATURES = [
  { name: "Fresha",              patterns: [/fresha\.com/i, /\bfresha\b/i] },
  { name: "Booksy",              patterns: [/booksy\.com/i, /\bbooksy\b/i] },
  { name: "Treatwell",           patterns: [/treatwell\./i, /\btreatwell\b/i] },
  { name: "Acuity Scheduling",   patterns: [/acuityscheduling\.com/i, /\bacuity\b/i] },
  { name: "Calendly",            patterns: [/calendly\.com/i] },
  { name: "Setmore",             patterns: [/setmore\.com/i, /\bsetmore\b/i] },
  { name: "SimplyBook.me",       patterns: [/simplybook\.(me|it)/i, /\bsimplybook\b/i] },
  { name: "GlossGenius",         patterns: [/glossgenius\.com/i, /\bglossgenius\b/i] },
  { name: "Vagaro",              patterns: [/vagaro\.com/i, /\bvagaro\b/i] },
  { name: "Timely",              patterns: [/gettimely\.com/i, /timelyapp\.com/i, /\bget ?timely\b/i] },
  { name: "Schedulicity",        patterns: [/schedulicity\.com/i, /\bschedulicity\b/i] },
  { name: "Picktime",            patterns: [/picktime\.com/i, /\bpicktime\b/i] },
  { name: "10to8",               patterns: [/10to8\.com/i, /\b10to8\b/i] },
  { name: "vcita",               patterns: [/vcita\.com/i, /\bvcita\b/i] },
  { name: "Square Appointments", patterns: [/squareup\.com\/appointments/i, /book\.squareup\.com/i, /square appointments/i] },
];

export function hostOf(url) {
  if (!url) return "";
  let u = String(url).trim();
  if (!/^https?:\/\//i.test(u)) u = "http://" + u;
  try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ""); }
  catch { return ""; }
}

export function isEmptyWebsite(url) {
  return !url || !String(url).trim();
}

export function isSocialOnly(url) {
  const h = hostOf(url);
  if (!h) return false;
  return SOCIAL_HOSTS.some((s) => h === s || h.endsWith("." + s));
}

// Returns the first matching platform name, or null. wa.me / WhatsApp does NOT
// count as a booking system (handled by it not being in BOOKING_SIGNATURES).
export function detectBookingPlatform(html) {
  const text = String(html || "");
  for (const sig of BOOKING_SIGNATURES) {
    if (sig.patterns.some((re) => re.test(text))) return sig.name;
  }
  return null;
}

/**
 * Classify one prospect.
 * @param {object} input
 * @param {string} [input.website]    raw website string from the prospect row
 * @param {string} [input.html]       fetched page HTML (+ optionally appended link hrefs)
 * @param {boolean}[input.fetchError] true if the GET failed/timed out/blocked
 * @returns {{has_website:boolean|null, has_booking_system:boolean|null,
 *            booking_platform:string|null, lead_temp:string, reason:string}}
 */
export function classify({ website, html, fetchError } = {}) {
  if (isEmptyWebsite(website)) {
    return { has_website: false, has_booking_system: false, booking_platform: null, lead_temp: "hot", reason: "no_website" };
  }
  if (isSocialOnly(website)) {
    return { has_website: false, has_booking_system: false, booking_platform: null, lead_temp: "hot", reason: "social_only" };
  }
  if (fetchError) {
    // Fail-safe: never block the queue. Site exists but we couldn't read it.
    return { has_website: true, has_booking_system: null, booking_platform: null, lead_temp: "unknown", reason: "fetch_error" };
  }
  const platform = detectBookingPlatform(html);
  if (platform) {
    return { has_website: true, has_booking_system: true, booking_platform: platform, lead_temp: "cold", reason: "booking_found" };
  }
  return { has_website: true, has_booking_system: false, booking_platform: null, lead_temp: "warm", reason: "no_booking" };
}
