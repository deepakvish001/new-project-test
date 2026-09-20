import { addDays, dayIndex, fromDayIndex, type IstDate } from "@bakaya/ladder";
import { bankRateOn } from "./bank-rate";

/**
 * MSMED Act s.16 interest.
 *
 * "...compound interest with monthly rests to the supplier on that amount from the
 * appointed day ... at three times of the bank rate notified by the Reserve Bank."
 *
 * Rules this file will not bend:
 *  - BigInt paise throughout. A rounding error on a document that goes to a buyer's
 *    auditor is indefensible.
 *  - The model never computes. This is arithmetic; the AI only writes prose around the
 *    numbers this function returns.
 *  - Every input is frozen into the result so the figure can be re-derived years later.
 *
 * NOT LEGAL ADVICE. Have a practising CA and a commercial lawyer review this computation
 * and the letter templates before the first letter is sent. See docs/08-legal-pack.md.
 */

export const MSMED_RATE_MULTIPLIER = 3;
const MONTHS_PER_YEAR = 12;

export interface MonthlyRest {
  readonly month: number;
  readonly from: IstDate;
  readonly to: IstDate;
  readonly openingPaise: bigint;
  readonly interestPaise: bigint;
  readonly closingPaise: bigint;
  readonly ratePct: number;
}

export interface InterestResult {
  readonly principalPaise: bigint;
  readonly interestPaise: bigint;
  readonly totalPaise: bigint;
  readonly appointedDay: IstDate;
  readonly asOf: IstDate;
  readonly daysOverdue: number;
  readonly completedMonths: number;
  readonly residualDays: number;
  readonly schedule: readonly MonthlyRest[];
}

/**
 * The appointed day: the day after the agreed credit period expires, capped at 45 days
 * from the invoice date per MSMED s.15.
 */
export function appointedDay(invoiceDate: IstDate, agreedCreditDays: number): IstDate {
  if (!Number.isInteger(agreedCreditDays) || agreedCreditDays < 0) {
    throw new RangeError(`agreedCreditDays must be a non-negative integer`);
  }
  return addDays(invoiceDate, Math.min(agreedCreditDays, 45) + 1);
}

/**
 * Compound interest with monthly rests. Each completed month compounds; any residual
 * days accrue simple interest on the compounded balance, pro-rated on a 365-day year.
 *
 * Rounding: each rest rounds half-up to the paisa, once. Rounding only at the end would
 * not reflect what compounding on a rounded balance actually produces.
 */
export function computeMsmedInterest(args: {
  principalPaise: bigint;
  appointedDay: IstDate;
  asOf: IstDate;
}): InterestResult {
  const { principalPaise, appointedDay: start, asOf } = args;

  if (principalPaise <= 0n) {
    throw new RangeError(`principalPaise must be positive, got ${principalPaise}`);
  }

  const daysOverdue = dayIndex(asOf) - dayIndex(start);
  if (daysOverdue < 0) {
    throw new RangeError(`asOf (${asOf}) is before the appointed day (${start})`);
  }

  const schedule: MonthlyRest[] = [];
  let balance = principalPaise;
  let cursor = start;
  let month = 0;

  // Compound each completed calendar month.
  for (;;) {
    const next = addMonths(cursor, 1);
    if (dayIndex(next) > dayIndex(asOf)) break;
    month += 1;
    const ratePct = bankRateOn(cursor) * MSMED_RATE_MULTIPLIER;
    const interest = roundHalfUp(
      balance * BigInt(Math.round(ratePct * 100)),
      BigInt(MONTHS_PER_YEAR * 100 * 100),
    );
    schedule.push({
      month,
      from: cursor,
      to: next,
      openingPaise: balance,
      interestPaise: interest,
      closingPaise: balance + interest,
      ratePct,
    });
    balance += interest;
    cursor = next;
  }

  // Residual days: simple interest on the compounded balance.
  const residualDays = dayIndex(asOf) - dayIndex(cursor);
  if (residualDays > 0) {
    const ratePct = bankRateOn(cursor) * MSMED_RATE_MULTIPLIER;
    const interest = roundHalfUp(
      balance * BigInt(Math.round(ratePct * 100)) * BigInt(residualDays),
      BigInt(365 * 100 * 100),
    );
    schedule.push({
      month: month + 1,
      from: cursor,
      to: asOf,
      openingPaise: balance,
      interestPaise: interest,
      closingPaise: balance + interest,
      ratePct,
    });
    balance += interest;
  }

  return {
    principalPaise,
    interestPaise: balance - principalPaise,
    totalPaise: balance,
    appointedDay: start,
    asOf,
    daysOverdue,
    completedMonths: month,
    residualDays,
    schedule,
  };
}

/** Round half-up on a positive rational. BigInt division truncates, so bias explicitly. */
function roundHalfUp(numerator: bigint, denominator: bigint): bigint {
  return (numerator * 2n + denominator) / (denominator * 2n);
}

/**
 * Add calendar months, clamping to the end of the target month.
 * 31 Jan + 1 month = 28 Feb (or 29 in a leap year), never 3 March.
 */
export function addMonths(date: IstDate, months: number): IstDate {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return fromDayIndex(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(d, lastDay)) / 86_400_000,
  );
}

/** ₹12,34,567.89 — Indian digit grouping, which is not what Intl gives you by default. */
export function formatPaise(paise: bigint): string {
  const negative = paise < 0n;
  const abs = negative ? -paise : paise;
  const rupees = abs / 100n;
  const paisaPart = (abs % 100n).toString().padStart(2, "0");
  const s = rupees.toString();
  // Last three digits, then groups of two.
  const head = s.length > 3 ? s.slice(0, -3) : "";
  const tail = s.length > 3 ? s.slice(-3) : s;
  const grouped = head ? head.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + tail : tail;
  return `${negative ? "-" : ""}₹${grouped}.${paisaPart}`;
}
