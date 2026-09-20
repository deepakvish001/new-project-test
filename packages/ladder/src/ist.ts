/**
 * IST (Asia/Kolkata) date helpers.
 *
 * India is UTC+05:30 with no daylight saving — it has not observed DST since 1945 — so a
 * fixed offset is exact here and avoids both a timezone dependency and the
 * `Intl.DateTimeFormat` round-trip.
 *
 * Business dates (due dates, promised dates) are handled as plain `IstDate` strings rather
 * than `Date` objects. A `Date` carries an instant, and an instant plus a naive
 * `(t2 - t1) / 86400000` silently shifts every ageing bucket by a day for half the clock —
 * which would mis-fire the 45-day statutory threshold a legal notice rests on.
 */

/** A calendar date in IST, `YYYY-MM-DD`. Not an instant. */
export type IstDate = string & { readonly __brand: "IstDate" };

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const DAY_MS = 86_400_000;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function istDate(value: string): IstDate {
  const m = DATE_RE.exec(value);
  if (!m) throw new RangeError(`Not an IstDate (expected YYYY-MM-DD): ${value}`);
  const [, y, mo, d] = m as unknown as [string, string, string, string];
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  const utc = Date.UTC(year, month - 1, day);
  const back = new Date(utc);
  // Rejects 2026-02-30 and 2026-13-01, which Date.UTC would otherwise roll over.
  if (
    back.getUTCFullYear() !== year ||
    back.getUTCMonth() !== month - 1 ||
    back.getUTCDate() !== day
  ) {
    throw new RangeError(`Not a real calendar date: ${value}`);
  }
  return value as IstDate;
}

/** Days since the Unix epoch for a calendar date. Integer, comparable, subtractable. */
export function dayIndex(date: IstDate): number {
  const m = DATE_RE.exec(date) as unknown as [string, string, string, string];
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DAY_MS;
}

/** Days since the epoch for the IST calendar day an instant falls on. */
export function dayIndexOfInstant(instant: Date): number {
  return Math.floor((instant.getTime() + IST_OFFSET_MS) / DAY_MS);
}

/** The IST calendar date an instant falls on. */
export function dateOfInstant(instant: Date): IstDate {
  return fromDayIndex(dayIndexOfInstant(instant));
}

export function fromDayIndex(index: number): IstDate {
  const d = new Date(index * DAY_MS);
  const y = String(d.getUTCFullYear()).padStart(4, "0");
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}` as IstDate;
}

export function addDays(date: IstDate, days: number): IstDate {
  return fromDayIndex(dayIndex(date) + days);
}

/**
 * Calendar days from `date` to the IST day of `instant`.
 * Positive means `instant` is after `date`. Used for days-overdue.
 */
export function daysSince(date: IstDate, instant: Date): number {
  return dayIndexOfInstant(instant) - dayIndex(date);
}

/** The instant at which the given IST hour begins on the given IST date. */
export function instantAt(date: IstDate, hourIst: number): Date {
  if (!Number.isInteger(hourIst) || hourIst < 0 || hourIst > 23) {
    throw new RangeError(`hourIst must be an integer 0-23, got ${hourIst}`);
  }
  return new Date(dayIndex(date) * DAY_MS + hourIst * 3_600_000 - IST_OFFSET_MS);
}

/** IST clock hour (0-23) of an instant. */
export function hourOfInstant(instant: Date): number {
  const msIntoDay =
    (instant.getTime() + IST_OFFSET_MS) - dayIndexOfInstant(instant) * DAY_MS;
  return Math.floor(msIntoDay / 3_600_000);
}

/** 0 = Sunday … 6 = Saturday, in IST. 1970-01-01 was a Thursday (index 4). */
export function weekdayOfInstant(instant: Date): number {
  return (((dayIndexOfInstant(instant) + 4) % 7) + 7) % 7;
}

export function isWeekend(instant: Date): boolean {
  const w = weekdayOfInstant(instant);
  return w === 0 || w === 6;
}

/**
 * Whether an IST hour falls inside a quiet window. The window may wrap midnight
 * (21:00 -> 09:00), which is why this is two bounds and not a range type.
 * `start === end` means no quiet hours at all.
 */
export function isQuietHour(hour: number, start: number, end: number): boolean {
  if (start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}
