export function getSaDateString(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function daysSinceSaISOString(iso: string, now: Date = new Date()): number {
  const nowDate = new Date(now);
  const thenDate = new Date(iso);
  const nowYmd = getSaDateString(nowDate);
  const thenYmd = getSaDateString(thenDate);
  const [ny, nm, nd] = nowYmd.split("-").map(Number);
  const [ty, tm, td] = thenYmd.split("-").map(Number);
  const a = Date.UTC(ny, nm - 1, nd);
  const b = Date.UTC(ty, tm - 1, td);
  return Math.floor((a - b) / 86400000);
}

export function addDaysToSaYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const base = Date.UTC(y, m - 1, d);
  const next = new Date(base + days * 86400000);
  const ny = next.getUTCFullYear();
  const nm = String(next.getUTCMonth() + 1).padStart(2, "0");
  const nd = String(next.getUTCDate()).padStart(2, "0");
  return `${ny}-${nm}-${nd}`;
}

export function daysBetweenSaYmd(aYmd: string, bYmd: string): number {
  const [ay, am, ad] = aYmd.split("-").map(Number);
  const [by, bm, bd] = bYmd.split("-").map(Number);
  const a = Date.UTC(ay, am - 1, ad);
  const b = Date.UTC(by, bm - 1, bd);
  return Math.floor((a - b) / 86400000);
}

