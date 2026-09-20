import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { canSendAt, decide, nextSendWindow } from "../src/decide.js";
import { dayIndex, fromDayIndex, instantAt } from "../src/ist.js";
import type { LadderInput, OrgPolicy, PromiseRecord } from "../src/types.js";
import { DEFAULT_POLICY, D } from "./fixtures.js";

/** Arbitraries over the realistic input space, not the whole type space. */

const arbDate = fc.integer({ min: dayIndex(D("2026-01-01")), max: dayIndex(D("2027-12-31")) })
  .map(fromDayIndex);

const arbInstant = fc.tuple(arbDate, fc.integer({ min: 0, max: 23 }))
  .map(([d, h]) => instantAt(d, h));

const arbPromise: fc.Arbitrary<PromiseRecord> = fc.record({
  promisedDate: arbDate,
  promisedPaise: fc.constant(null),
  status: fc.constantFrom("PENDING", "KEPT", "BROKEN", "SUPERSEDED"),
  createdAtRung: fc.integer({ min: 0, max: 6 }),
  createdAt: arbInstant,
});

const arbPolicy: fc.Arbitrary<OrgPolicy> = fc.record({
  tone: fc.constantFrom("GENTLE", "STANDARD", "FIRM"),
  rungOffsetsDays: fc.constant(DEFAULT_POLICY.rungOffsetsDays),
  maxAutoRung: fc.integer({ min: 0, max: 6 }),
  quietStartHourIst: fc.integer({ min: 0, max: 23 }),
  quietEndHourIst: fc.integer({ min: 0, max: 23 }),
  sendOnWeekends: fc.boolean(),
  minInvoicePaise: fc.constantFrom(0n, 100_000n, 1_000_000n),
  pauseOnHostile: fc.boolean(),
  defaultLanguage: fc.constantFrom("hi", "en", "gu", "mr", "ta", "pa"),
});

const arbInput: fc.Arbitrary<LadderInput> = fc.record({
  invoice: fc.record({
    dueDate: arbDate,
    amountPaise: fc.bigInt({ min: 1n, max: 10_000_000_000n }),
    paidPaise: fc.bigInt({ min: 0n, max: 10_000_000_000n }),
    status: fc.constantFrom(
      "OPEN", "PARTIALLY_PAID", "PAID", "DISPUTED", "WRITTEN_OFF", "ON_HOLD",
    ),
    currentRung: fc.integer({ min: 0, max: 6 }),
    ladderPausedUntil: fc.option(arbInstant, { nil: null }),
    legalApprovedAt: fc.option(arbInstant, { nil: null }),
  }),
  buyer: fc.record({
    isPaused: fc.boolean(),
    maxRungOverride: fc.option(fc.integer({ min: 0, max: 6 }), { nil: null }),
    preferredLanguage: fc.option(fc.constantFrom("hi", "pa", "ta"), { nil: null }),
  }),
  contact: fc.record({ optedOutAt: fc.option(arbInstant, { nil: null }) }),
  promises: fc.array(arbPromise, { maxLength: 6 }),
  disputes: fc.array(fc.record({
    status: fc.constantFrom("OPEN", "RESOLVED", "ESCALATED"),
  }), { maxLength: 3 }),
  lastInbound: fc.option(
    fc.record({
      intent: fc.constantFrom(
        "PROMISE_TO_PAY", "ALREADY_PAID", "DISPUTE", "NEEDS_DOCUMENT",
        "PARTIAL_PAYMENT", "WRONG_NUMBER", "HOSTILE", "UNCLEAR", "OTHER",
      ),
      receivedAt: arbInstant,
    }),
    { nil: null },
  ),
  policy: arbPolicy,
}) as fc.Arbitrary<LadderInput>;

const RUNS = { numRuns: 3000 };

describe("safety invariants — these must hold for every possible input", () => {
  it("never sends on a settled invoice", () => {
    fc.assert(fc.property(arbInput, arbInstant, (i, now) => {
      const settled = i.invoice.status === "PAID"
        || i.invoice.amountPaise - i.invoice.paidPaise <= 0n;
      if (settled) expect(decide(i, now).action).toBe("STOP");
    }), RUNS);
  });

  it("never sends to a contact who opted out", () => {
    // Only "never SEND" is the invariant. The exact reason can legitimately be
    // invoice_paid or invoice_closed, since guards 1-2 sit above the opt-out guard —
    // all three stop, which is what matters. Guard 3's own reason is pinned in
    // guards.test.ts where the higher guards are held clear.
    fc.assert(fc.property(arbInput, arbInstant, (i, now) => {
      if (i.contact.optedOutAt !== null) {
        expect(decide(i, now).action).toBe("STOP");
      }
    }), RUNS);
  });

  it("never sends while a dispute is open", () => {
    fc.assert(fc.property(arbInput, arbInstant, (i, now) => {
      if (i.disputes.some((d) => d.status === "OPEN")) {
        expect(decide(i, now).action).not.toBe("SEND");
      }
    }), RUNS);
  });

  it("never sends a legal rung without approval", () => {
    fc.assert(fc.property(arbInput, arbInstant, (i, now) => {
      const d = decide(i, now);
      if (d.action !== "SEND") return;
      const ceiling = Math.min(
        i.policy.maxAutoRung,
        i.buyer.maxRungOverride ?? Number.POSITIVE_INFINITY,
      );
      if (d.rung > ceiling) expect(i.invoice.legalApprovedAt).not.toBeNull();
    }), RUNS);
  });

  it("never sends outside the org's send window", () => {
    fc.assert(fc.property(arbInput, arbInstant, (i, now) => {
      if (decide(i, now).action === "SEND") {
        expect(canSendAt(now, i.policy)).toBe(true);
      }
    }), RUNS);
  });

  it("never moves the ladder backwards", () => {
    fc.assert(fc.property(arbInput, arbInstant, (i, now) => {
      const d = decide(i, now);
      if (d.action === "SEND" || d.action === "REQUEST_APPROVAL") {
        expect(d.rung).toBeGreaterThan(i.invoice.currentRung);
      }
    }), RUNS);
  });

  it("never emits a rung outside the configured range", () => {
    fc.assert(fc.property(arbInput, arbInstant, (i, now) => {
      const d = decide(i, now);
      if (d.action === "SEND" || d.action === "REQUEST_APPROVAL") {
        expect(d.rung).toBeGreaterThanOrEqual(1);
        expect(d.rung).toBeLessThanOrEqual(i.policy.rungOffsetsDays.length);
      }
    }), RUNS);
  });

  it("always schedules a WAIT strictly in the future or at the pause instant", () => {
    fc.assert(fc.property(arbInput, arbInstant, (i, now) => {
      const d = decide(i, now);
      if (d.action === "WAIT" && d.reason === "quiet_hours") {
        expect(d.until.getTime()).toBeGreaterThan(now.getTime());
      }
    }), RUNS);
  });
});

describe("determinism", () => {
  it("returns an identical decision for identical input and clock", () => {
    fc.assert(fc.property(arbInput, arbInstant, (i, now) => {
      expect(decide(i, now)).toEqual(decide(i, now));
    }), RUNS);
  });

  it("does not mutate its input", () => {
    fc.assert(fc.property(arbInput, arbInstant, (i, now) => {
      const before = JSON.stringify(i, (_, v) =>
        typeof v === "bigint" ? v.toString() : v);
      decide(i, now);
      const after = JSON.stringify(i, (_, v) =>
        typeof v === "bigint" ? v.toString() : v);
      expect(after).toBe(before);
    }), RUNS);
  });
});

describe("nextSendWindow", () => {
  it("always returns a sendable instant", () => {
    fc.assert(fc.property(arbPolicy, arbInstant, (p, now) => {
      fc.pre(p.quietStartHourIst !== p.quietEndHourIst || !p.sendOnWeekends);
      const next = nextSendWindow(now, p);
      expect(canSendAt(next, p)).toBe(true);
    }), RUNS);
  });

  it("never moves backwards in time", () => {
    fc.assert(fc.property(arbPolicy, arbInstant, (p, now) => {
      expect(nextSendWindow(now, p).getTime()).toBeGreaterThanOrEqual(now.getTime());
    }), RUNS);
  });

  it("returns the instant unchanged when it is already sendable", () => {
    fc.assert(fc.property(arbPolicy, arbInstant, (p, now) => {
      if (canSendAt(now, p)) expect(nextSendWindow(now, p)).toEqual(now);
    }), RUNS);
  });
});
