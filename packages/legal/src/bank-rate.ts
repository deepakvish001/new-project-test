import { dayIndex, istDate, type IstDate } from "@bakaya/ladder";

/**
 * RBI Bank Rate history.
 *
 * MSMED s.16 interest is three times this rate, so a missed change makes every letter
 * issued after it wrong. This is versioned data with effective-from dates, never a
 * constant: when the RBI moves the rate, add a row here in a migration and the
 * computation for past periods stays correct.
 *
 * Verify against rbi.org.in before the first letter ships, and re-verify quarterly.
 * These entries are a starting table, not an authority.
 */
export interface BankRatePeriod {
  readonly from: IstDate;
  readonly ratePct: number;
}

export const BANK_RATE_HISTORY: readonly BankRatePeriod[] = [
  { from: istDate("2022-05-04"), ratePct: 4.65 },
  { from: istDate("2022-06-08"), ratePct: 5.15 },
  { from: istDate("2022-08-05"), ratePct: 5.65 },
  { from: istDate("2022-09-30"), ratePct: 6.15 },
  { from: istDate("2022-12-07"), ratePct: 6.50 },
  { from: istDate("2023-02-08"), ratePct: 6.75 },
  { from: istDate("2025-02-07"), ratePct: 6.50 },
  { from: istDate("2025-04-09"), ratePct: 6.25 },
  { from: istDate("2025-06-06"), ratePct: 5.75 },
];

export class BankRateUnavailable extends Error {
  constructor(date: IstDate) {
    super(
      `No RBI bank rate on record for ${date}. Add the period to BANK_RATE_HISTORY ` +
        `before generating a legal document for this date.`,
    );
    this.name = "BankRateUnavailable";
  }
}

/** The bank rate in force on a date. Throws rather than guessing. */
export function bankRateOn(date: IstDate): number {
  const target = dayIndex(date);
  let found: BankRatePeriod | null = null;
  for (const period of BANK_RATE_HISTORY) {
    if (dayIndex(period.from) <= target) {
      if (found === null || dayIndex(period.from) > dayIndex(found.from)) found = period;
    }
  }
  if (found === null) throw new BankRateUnavailable(date);
  return found.ratePct;
}
