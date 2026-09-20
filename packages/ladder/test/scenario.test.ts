import { describe, expect, it } from "vitest";
import { decide } from "../src/decide";
import type { LadderInput, PromiseRecord } from "../src/types";
import { at, D, input, promise } from "./fixtures";

/**
 * The worked example from docs/04-collections-engine.md §7, replayed day by day.
 * ₹4,20,000 due Wed 14 Oct 2026, Ludhiana buyer, Hindi, standard tone.
 *
 * This is the end-to-end shape of the product, and the one test to read first when
 * changing the engine.
 */
describe("worked example — ₹4,20,000 invoice, 14 Oct 2026", () => {
  let state: LadderInput = input();
  const promises: PromiseRecord[] = [];

  const advance = (partial: Partial<LadderInput["invoice"]>) => {
    state = input({ invoice: { ...state.invoice, ...partial }, promises: [...promises] });
  };

  it("Sat 10 Oct — nothing due yet, waits", () => {
    const d = decide(state, at("2026-10-10", 10));
    expect(d).toMatchObject({ action: "WAIT", reason: "rung_already_sent" });
  });

  it("Sun 11 Oct — rung 1 is due, but it is a weekend, so it defers to Monday", () => {
    // The doc's example showed rung 1 sending on 11 Oct. 11 Oct 2026 is a Sunday and the
    // default policy has sendOnWeekends: false, so the real behaviour is a deferral.
    // Found by this test; docs/04 §7 corrected to match.
    const d = decide(state, at("2026-10-11", 10));
    expect(d).toMatchObject({ action: "WAIT", reason: "weekend" });
    if (d.action !== "WAIT") throw new Error("unreachable");
    expect(d.until).toEqual(at("2026-10-12", 9)); // Monday 09:00
  });

  it("Mon 12 Oct — rung 1 pre-due courtesy goes out", () => {
    expect(decide(state, at("2026-10-12", 10))).toEqual({
      action: "SEND",
      rung: 1,
      template: "bakaya_r1_standard_hi",
      variant: "STANDARD",
      language: "hi",
      reason: "due_date_passed",
    });
    advance({ currentRung: 1 });
  });

  it("Wed 14 Oct — rung 2, due today", () => {
    expect(decide(state, at("2026-10-14", 10))).toMatchObject({
      action: "SEND",
      rung: 2,
      template: "bakaya_r2_standard_hi",
    });
    advance({ currentRung: 2 });
  });

  it("Wed 14 Oct — buyer replies 'abhi cash tight hai, 25 ko dekhte hain'", () => {
    // Classified PROMISE_TO_PAY, date 2026-10-25, confidence 0.91.
    promises.push(promise({
      promisedDate: D("2026-10-25"),
      createdAtRung: 2,
      createdAt: at("2026-10-14", 12),
    }));
    advance({});
    const d = decide(state, at("2026-10-14", 13));
    expect(d).toMatchObject({ action: "WAIT", reason: "promise_pending" });
  });

  it("Wed 21 Oct — rung 3 is suppressed by the promise. This silence is the product", () => {
    const d = decide(state, at("2026-10-21", 10));
    expect(d).toMatchObject({ action: "WAIT", reason: "promise_pending" });
    if (d.action !== "WAIT") throw new Error("unreachable");
    expect(d.until).toEqual(at("2026-10-26", 0));
  });

  it("Mon 26 Oct — promise broken, ladder jumps 2 -> 4 with the broken-promise variant", () => {
    promises[0] = promise({
      promisedDate: D("2026-10-25"),
      status: "BROKEN",
      createdAtRung: 2,
      createdAt: at("2026-10-14", 12),
    });
    advance({});
    // Time-based rung on D+12 is 3; one broken promise accelerates by one.
    expect(decide(state, at("2026-10-26", 10))).toEqual({
      action: "SEND",
      rung: 4,
      template: "bakaya_r4_broken_promise_hi",
      variant: "BROKEN_PROMISE",
      language: "hi",
      reason: "promise_broken",
    });
    advance({ currentRung: 4 });
  });

  it("Mon 02 Nov — rung 5 is legal, so it asks the owner instead of sending", () => {
    expect(decide(state, at("2026-11-02", 10)))
      .toEqual({ action: "REQUEST_APPROVAL", rung: 5, reason: "needs_legal_approval" });
  });

  it("Mon 02 Nov — owner replies '1'; rung 5 fires with the 43B(h) letter", () => {
    advance({ legalApprovedAt: at("2026-11-02", 19) });
    expect(decide(state, at("2026-11-03", 10))).toMatchObject({
      action: "SEND",
      rung: 5,
      template: "bakaya_r5_broken_promise_hi",
    });
    advance({ currentRung: 5 });
  });

  it("Mon 09 Nov — payment lands, ladder stops", () => {
    advance({ status: "PAID", paidPaise: 42_000_000n });
    expect(decide(state, at("2026-11-09", 10)))
      .toEqual({ action: "STOP", reason: "invoice_paid" });
  });

  it("stays stopped forever afterwards", () => {
    for (const day of ["2026-11-10", "2026-12-25", "2027-06-01"]) {
      expect(decide(state, at(day, 10)).action).toBe("STOP");
    }
  });
});

describe("relationship-safety scenario — buyer gets angry mid-ladder", () => {
  it("stops immediately and escalates to the owner, not to rung 4", () => {
    const state = input({
      invoice: { currentRung: 3 },
      lastInbound: { intent: "HOSTILE", receivedAt: at("2026-10-28", 15) },
    });
    // 29 Oct is D+15 — rung 4 would otherwise fire.
    expect(decide(state, at("2026-10-29", 10)))
      .toEqual({ action: "HANDOFF_TO_OWNER", reason: "buyer_hostile", urgency: "HIGH" });
  });
});

describe("stale-sync safety — an invoice paid in Tally but not yet synced", () => {
  it("stops the moment the balance reaches zero, before the status column catches up", () => {
    const state = input({
      invoice: { currentRung: 3, status: "OPEN", paidPaise: 42_000_000n },
    });
    expect(decide(state, at("2026-10-29", 10)))
      .toEqual({ action: "STOP", reason: "invoice_paid" });
  });
});
