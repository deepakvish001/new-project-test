import { istDate } from "@bakaya/ladder";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { bankRateOn, BankRateUnavailable } from "../src/bank-rate";
import {
  addMonths, appointedDay, computeMsmedInterest, formatPaise, MSMED_RATE_MULTIPLIER,
} from "../src/interest";

const D = istDate;

describe("appointedDay — MSMED s.15", () => {
  it("is the day after the agreed period", () => {
    // 1 Oct + 30 days credit -> the period ends 31 Oct, so the appointed day is 1 Nov.
    expect(appointedDay(D("2026-10-01"), 30)).toBe("2026-11-01");
  });

  it("caps the agreed period at 45 days even when the contract says more", () => {
    expect(appointedDay(D("2026-10-01"), 90)).toBe(appointedDay(D("2026-10-01"), 45));
  });

  it("rejects a nonsense credit period", () => {
    expect(() => appointedDay(D("2026-10-01"), -1)).toThrow(RangeError);
    expect(() => appointedDay(D("2026-10-01"), 30.5)).toThrow(RangeError);
  });
});

describe("bankRateOn", () => {
  it("picks the period in force", () => {
    expect(bankRateOn(D("2026-09-20"))).toBe(5.75);
    expect(bankRateOn(D("2025-03-01"))).toBe(6.50);
    expect(bankRateOn(D("2023-02-08"))).toBe(6.75); // on the effective date itself
  });

  it("throws rather than guessing a rate before the table starts", () => {
    expect(() => bankRateOn(D("2020-01-01"))).toThrow(BankRateUnavailable);
  });
});

describe("computeMsmedInterest", () => {
  it("is zero on the appointed day itself", () => {
    const r = computeMsmedInterest({
      principalPaise: 42_000_000n,
      appointedDay: D("2026-01-01"),
      asOf: D("2026-01-01"),
    });
    expect(r.interestPaise).toBe(0n);
    expect(r.totalPaise).toBe(42_000_000n);
    expect(r.schedule).toHaveLength(0);
  });

  it("applies three times the bank rate", () => {
    const r = computeMsmedInterest({
      principalPaise: 100_000_000n, // ₹10,00,000
      appointedDay: D("2026-01-01"),
      asOf: D("2026-02-01"),
    });
    // One month at 5.75 × 3 = 17.25% p.a. -> 10,00,000 × 0.1725 / 12 = ₹14,375.00
    expect(r.schedule[0]?.ratePct).toBe(5.75 * MSMED_RATE_MULTIPLIER);
    expect(r.interestPaise).toBe(1_437_500n);
    expect(formatPaise(r.interestPaise)).toBe("₹14,375.00");
  });

  it("compounds with monthly rests rather than accruing simple interest", () => {
    const compound = computeMsmedInterest({
      principalPaise: 100_000_000n,
      appointedDay: D("2026-01-01"),
      asOf: D("2027-01-01"),
    });
    const simpleTwelveMonths = 1_437_500n * 12n;
    expect(compound.completedMonths).toBe(12);
    expect(compound.interestPaise).toBeGreaterThan(simpleTwelveMonths);
  });

  it("adds simple interest for residual days after the last rest", () => {
    const r = computeMsmedInterest({
      principalPaise: 100_000_000n,
      appointedDay: D("2026-01-01"),
      asOf: D("2026-02-16"),
    });
    expect(r.completedMonths).toBe(1);
    expect(r.residualDays).toBe(15);
    expect(r.schedule).toHaveLength(2);
    expect(r.schedule[1]?.openingPaise).toBe(101_437_500n);
  });

  it("freezes every input needed to re-derive the figure", () => {
    const r = computeMsmedInterest({
      principalPaise: 42_000_000n,
      appointedDay: D("2026-01-01"),
      asOf: D("2026-06-15"),
    });
    expect(r).toMatchObject({
      principalPaise: 42_000_000n,
      appointedDay: "2026-01-01",
      asOf: "2026-06-15",
      daysOverdue: 165,
    });
    for (const rest of r.schedule) {
      expect(rest.closingPaise).toBe(rest.openingPaise + rest.interestPaise);
    }
  });

  it("rejects a backwards date range and a non-positive principal", () => {
    expect(() => computeMsmedInterest({
      principalPaise: 1n, appointedDay: D("2026-06-01"), asOf: D("2026-01-01"),
    })).toThrow(RangeError);
    expect(() => computeMsmedInterest({
      principalPaise: 0n, appointedDay: D("2026-01-01"), asOf: D("2026-06-01"),
    })).toThrow(RangeError);
  });
});

describe("addMonths clamps to the end of the month", () => {
  it.each([
    ["2026-01-31", 1, "2026-02-28"],
    ["2028-01-31", 1, "2028-02-29"], // leap year
    ["2026-03-31", 1, "2026-04-30"],
    ["2026-12-31", 1, "2027-01-31"],
    ["2026-01-15", 12, "2027-01-15"],
  ] as const)("%s + %i months = %s", (from, n, expected) => {
    expect(addMonths(D(from), n)).toBe(expected);
  });
});

describe("formatPaise — Indian digit grouping", () => {
  it.each([
    [0n, "₹0.00"],
    [100n, "₹1.00"],
    [123_456_789n, "₹12,34,567.89"],
    [42_000_000n, "₹4,20,000.00"],
    [100_000_000_000n, "₹1,00,00,00,000.00"], // 100 crore
    [-50_000n, "-₹500.00"],
  ] as const)("%s -> %s", (paise, expected) => {
    expect(formatPaise(paise)).toBe(expected);
  });
});

describe("invariants", () => {
  const arbPrincipal = fc.bigInt({ min: 1n, max: 1_000_000_000_000n });
  const arbMonths = fc.integer({ min: 0, max: 60 });

  it("interest is never negative and total never shrinks", () => {
    fc.assert(fc.property(arbPrincipal, arbMonths, (principal, months) => {
      const r = computeMsmedInterest({
        principalPaise: principal,
        appointedDay: D("2026-01-01"),
        asOf: addMonths(D("2026-01-01"), months),
      });
      expect(r.interestPaise).toBeGreaterThanOrEqual(0n);
      expect(r.totalPaise).toBeGreaterThanOrEqual(principal);
      expect(r.totalPaise).toBe(r.principalPaise + r.interestPaise);
    }), { numRuns: 1500 });
  });

  it("is monotonic in time — more delay never costs the buyer less", () => {
    fc.assert(fc.property(arbPrincipal, fc.integer({ min: 0, max: 40 }), (p, m) => {
      const at = (n: number) => computeMsmedInterest({
        principalPaise: p,
        appointedDay: D("2026-01-01"),
        asOf: addMonths(D("2026-01-01"), n),
      }).totalPaise;
      expect(at(m + 1)).toBeGreaterThanOrEqual(at(m));
    }), { numRuns: 1500 });
  });

  it("the schedule always chains: each rest opens where the last one closed", () => {
    fc.assert(fc.property(arbPrincipal, arbMonths, (p, m) => {
      const r = computeMsmedInterest({
        principalPaise: p,
        appointedDay: D("2026-01-01"),
        asOf: addMonths(D("2026-01-01"), m),
      });
      let balance = r.principalPaise;
      for (const rest of r.schedule) {
        expect(rest.openingPaise).toBe(balance);
        balance = rest.closingPaise;
      }
      expect(balance).toBe(r.totalPaise);
    }), { numRuns: 1500 });
  });
});
