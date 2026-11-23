import { describe, expect, it } from "vitest";
import {
  ammanDayBoundsUtc,
  ammanHourOfDay,
  ammanWallClockToUtcIso,
  formatAmmanDateTime,
  formatAmmanTime,
  shiftAmmanDate,
} from "../src/timezone";

describe("Asia/Amman timezone helpers (fixed UTC+03:00, no DST)", () => {
  it("computes day bounds as UTC-03:00 offsets", () => {
    const { startUtcIso, endUtcIso } = ammanDayBoundsUtc("2026-06-15");
    expect(startUtcIso).toBe("2026-06-14T21:00:00.000Z");
    expect(endUtcIso).toBe("2026-06-15T20:59:59.999Z");
  });

  it("treats a datetime-local value as Amman wall-clock time, not the host's own timezone", () => {
    expect(ammanWallClockToUtcIso("2026-06-15T08:00")).toBe("2026-06-15T05:00:00.000Z");
  });

  it("shifts a date by whole days without crossing a DST boundary issue (Jordan has none)", () => {
    expect(shiftAmmanDate("2026-06-15", 1)).toBe("2026-06-16");
    expect(shiftAmmanDate("2026-06-15", -1)).toBe("2026-06-14");
    expect(shiftAmmanDate("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("computes fractional hour-of-day in Amman time from a UTC instant", () => {
    expect(ammanHourOfDay("2026-06-15T05:30:00.000Z")).toBe(8.5);
  });

  it("formats time and date-time in Amman local time", () => {
    expect(formatAmmanTime("2026-06-15T05:00:00.000Z")).toBe("08:00");
    expect(formatAmmanDateTime("2026-06-15T05:00:00.000Z")).toBe("15 Jun, 08:00");
  });
});
