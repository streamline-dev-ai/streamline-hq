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

