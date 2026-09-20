import { describe, expect, it } from "vitest";
import {
  addDays, dateOfInstant, dayIndex, dayIndexOfInstant, daysSince, fromDayIndex,
  hourOfInstant, instantAt, isQuietHour, isWeekend, istDate, weekdayOfInstant,
} from "../src/ist";

describe("istDate", () => {
  it("accepts a real date", () => {
    expect(istDate("2026-10-14")).toBe("2026-10-14");
  });

  it.each(["2026-10-4", "14-10-2026", "2026/10/14", "", "today"])(
    "rejects malformed %s",
    (bad) => expect(() => istDate(bad)).toThrow(RangeError),
  );

  it.each(["2026-02-30", "2026-13-01", "2026-00-10", "2025-02-29"])(
    "rejects non-existent %s instead of rolling it over",
    (bad) => expect(() => istDate(bad)).toThrow(/not a real calendar date/i),
  );

  it("accepts a real leap day", () => {
    expect(istDate("2028-02-29")).toBe("2028-02-29");
  });
});

describe("day boundaries", () => {
  // IST midnight is 18:30 UTC the previous day. This is the bug class that would shift
  // every ageing bucket by a day and mis-fire the 45-day statutory threshold.
  it("treats 18:30:00 UTC as the start of the next IST day", () => {
    expect(dateOfInstant(new Date("2026-10-13T18:29:59Z"))).toBe("2026-10-13");
    expect(dateOfInstant(new Date("2026-10-13T18:30:00Z"))).toBe("2026-10-14");
  });

  it("puts 23:00 UTC on the following IST calendar day", () => {
    expect(dateOfInstant(new Date("2026-10-13T23:00:00Z"))).toBe("2026-10-14");
  });

  it("puts 00:30 UTC still on the same IST day", () => {
    expect(dateOfInstant(new Date("2026-10-14T00:30:00Z"))).toBe("2026-10-14");
  });

  it("round-trips instantAt and hourOfInstant across the UTC date line", () => {
    for (const h of [0, 1, 5, 9, 12, 18, 21, 23]) {
      const t = instantAt(istDate("2026-10-14"), h);
      expect(hourOfInstant(t)).toBe(h);
      expect(dateOfInstant(t)).toBe("2026-10-14");
    }
  });

  it("rejects an out-of-range hour", () => {
    expect(() => instantAt(istDate("2026-10-14"), 24)).toThrow(RangeError);
    expect(() => instantAt(istDate("2026-10-14"), -1)).toThrow(RangeError);
    expect(() => instantAt(istDate("2026-10-14"), 9.5)).toThrow(RangeError);
  });
});

describe("arithmetic", () => {
  it("counts days across a month boundary", () => {
    expect(daysSince(istDate("2026-10-14"), instantAt(istDate("2026-11-02"), 10))).toBe(19);
  });

  it("is negative before the due date", () => {
    expect(daysSince(istDate("2026-10-14"), instantAt(istDate("2026-10-11"), 10))).toBe(-3);
  });

  it("is zero on the due date regardless of hour", () => {
    for (const h of [0, 9, 23]) {
      expect(daysSince(istDate("2026-10-14"), instantAt(istDate("2026-10-14"), h))).toBe(0);
    }
  });

  it("crosses a leap day correctly", () => {
    expect(daysSince(istDate("2028-02-28"), instantAt(istDate("2028-03-01"), 10))).toBe(2);
  });

  it("addDays crosses year boundaries", () => {
    expect(addDays(istDate("2026-12-30"), 5)).toBe("2027-01-04");
    expect(addDays(istDate("2027-01-02"), -5)).toBe("2026-12-28");
  });

  it("dayIndex and fromDayIndex are inverses", () => {
    expect(fromDayIndex(dayIndex(istDate("2026-10-14")))).toBe("2026-10-14");
  });

  it("dayIndexOfInstant agrees with dayIndex of its IST date", () => {
    const t = new Date("2026-10-13T20:00:00Z"); // 01:30 IST on the 14th
    expect(dayIndexOfInstant(t)).toBe(dayIndex(istDate("2026-10-14")));
  });
});

describe("weekday", () => {
  it.each([
    ["2026-10-11", 0, true],  // Sunday
    ["2026-10-12", 1, false],
    ["2026-10-14", 3, false], // Wednesday
    ["2026-10-16", 5, false],
    ["2026-10-17", 6, true],  // Saturday
  ] as const)("%s -> weekday %i", (date, expected, weekend) => {
    const t = instantAt(istDate(date), 10);
    expect(weekdayOfInstant(t)).toBe(expected);
    expect(isWeekend(t)).toBe(weekend);
  });

  it("uses the IST day, not the UTC day", () => {
    // 22:00 UTC Sat 17 Oct is 03:30 IST Sun 18 Oct — still a weekend, but a different day.
    const t = new Date("2026-10-17T22:00:00Z");
    expect(dateOfInstant(t)).toBe("2026-10-18");
    expect(weekdayOfInstant(t)).toBe(0);
  });
});

describe("isQuietHour", () => {
  it("handles a window that wraps midnight (21 -> 9)", () => {
    expect(isQuietHour(22, 21, 9)).toBe(true);
    expect(isQuietHour(2, 21, 9)).toBe(true);
    expect(isQuietHour(21, 21, 9)).toBe(true);  // inclusive start
    expect(isQuietHour(9, 21, 9)).toBe(false);  // exclusive end
    expect(isQuietHour(10, 21, 9)).toBe(false);
    expect(isQuietHour(20, 21, 9)).toBe(false);
  });

  it("handles a same-day window (13 -> 15)", () => {
    expect(isQuietHour(14, 13, 15)).toBe(true);
    expect(isQuietHour(13, 13, 15)).toBe(true);
    expect(isQuietHour(15, 13, 15)).toBe(false);
    expect(isQuietHour(2, 13, 15)).toBe(false);
  });

  it("treats start === end as no quiet hours at all", () => {
    for (const h of [0, 9, 12, 21, 23]) expect(isQuietHour(h, 9, 9)).toBe(false);
  });
});
