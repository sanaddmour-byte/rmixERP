/**
 * Asia/Amman time handling for scheduling/dispatch.
 *
 * Jordan abolished daylight-saving time in 2022 and has used a fixed
 * UTC+03:00 offset year-round since (Jordanian government decision,
 * October 2022) — verified against public reporting at the time, not
 * guessed. If Jordan ever reintroduces DST, this fixed-offset constant
 * is the one place to correct; `formatInAmman` additionally reads the
 * real IANA "Asia/Amman" zone via `Intl`, so display formatting would
 * self-correct even before this constant is updated.
 */
const AMMAN_UTC_OFFSET = "+03:00";

/** Today's date in Amman local time, as `YYYY-MM-DD`. */
export function todayInAmman(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Amman" }).format(new Date());
}

/**
 * The UTC instants corresponding to the start (00:00:00.000) and end
 * (23:59:59.999) of the given Amman-local calendar day, as ISO strings.
 * Use for any "day window" query (dispatch schedule, day navigation)
 * instead of UTC-midnight boundaries, which are 3 hours off Amman's.
 */
export function ammanDayBoundsUtc(ammanDate: string): { startUtcIso: string; endUtcIso: string } {
  const start = new Date(`${ammanDate}T00:00:00.000${AMMAN_UTC_OFFSET}`);
  const end = new Date(`${ammanDate}T23:59:59.999${AMMAN_UTC_OFFSET}`);
  return { startUtcIso: start.toISOString(), endUtcIso: end.toISOString() };
}

/**
 * Converts a `YYYY-MM-DDTHH:mm` wall-clock string (as produced by an
 * `<input type="datetime-local">`) to a UTC ISO instant, treating it as
 * Amman local time explicitly — not the browser's own timezone, which a
 * plain `new Date(datetimeLocal).toISOString()` would use instead and
 * which is wrong whenever the viewer isn't physically in Jordan.
 */
export function ammanWallClockToUtcIso(datetimeLocal: string): string {
  return new Date(`${datetimeLocal}:00.000${AMMAN_UTC_OFFSET}`).toISOString();
}

/** The previous/next Amman-local calendar day, as `YYYY-MM-DD`. */
export function shiftAmmanDate(ammanDate: string, deltaDays: number): string {
  const d = new Date(`${ammanDate}T12:00:00.000${AMMAN_UTC_OFFSET}`); // noon avoids any boundary edge case
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Amman" }).format(d);
}

/** Hour-of-day in Amman local time (0–24, fractional), for positioning a timeline marker. */
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

/** Formats a UTC instant as an Amman-local time string, e.g. "14:05". */
export function formatAmmanTime(utcIso: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Amman", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(
    new Date(utcIso),
  );
}

/** Formats a UTC instant as an Amman-local date+time string for detail views. */
export function formatAmmanDateTime(utcIso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Amman",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(utcIso));
}
