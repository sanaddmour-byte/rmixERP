/**
 * Jordan abolished daylight saving in 2022 — Asia/Amman is a fixed
 * UTC+03:00 offset year-round, so these use an explicit offset string
 * rather than a timezone database dependency. DOMAIN.md/CLAUDE.md require
 * day boundaries, timeline positions, and displayed times to go through
 * one of these, never raw `Date` arithmetic.
 */
const AMMAN_UTC_OFFSET = "+03:00";

/** Today's date in Amman, as "YYYY-MM-DD". */
export function todayInAmman(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Amman" }).format(new Date());
}

/** The UTC instants corresponding to 00:00:00.000 and 23:59:59.999 Amman time on the given Amman date. */
export function ammanDayBoundsUtc(ammanDate: string): { startUtcIso: string; endUtcIso: string } {
  const start = new Date(`${ammanDate}T00:00:00.000${AMMAN_UTC_OFFSET}`);
  const end = new Date(`${ammanDate}T23:59:59.999${AMMAN_UTC_OFFSET}`);
  return { startUtcIso: start.toISOString(), endUtcIso: end.toISOString() };
}

/**
 * Converts a `datetime-local` input value (wall-clock, no timezone) into a
 * UTC ISO string, treating it as Amman time — not the browser's own
 * timezone, which is what `new Date(datetimeLocal).toISOString()` would
 * silently do instead.
 */
export function ammanWallClockToUtcIso(datetimeLocal: string): string {
  return new Date(`${datetimeLocal}:00.000${AMMAN_UTC_OFFSET}`).toISOString();
}

/** Shifts an Amman date string by whole days, anchored at noon to sidestep any DST-adjacent edge case. */
export function shiftAmmanDate(ammanDate: string, deltaDays: number): string {
  const anchored = new Date(`${ammanDate}T12:00:00.000${AMMAN_UTC_OFFSET}`);
  anchored.setUTCDate(anchored.getUTCDate() + deltaDays);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Amman" }).format(anchored);
}

/** Hour-of-day (0-24, fractional) in Amman time for a UTC ISO instant — the Gantt's x-axis unit. */
export function ammanHourOfDay(utcIso: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Amman",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(utcIso));
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour + minute / 60;
}

/** "14:05" in Amman time. */
export function formatAmmanTime(utcIso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Amman",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(utcIso));
}

/** "23 Nov, 14:05" in Amman time. */
export function formatAmmanDateTime(utcIso: string): string {
  const d = new Date(utcIso);
  const date = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Amman", day: "2-digit", month: "short" }).format(d);
  return `${date}, ${formatAmmanTime(utcIso)}`;
}
