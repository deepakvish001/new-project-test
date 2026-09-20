import { describe, expect, it } from "vitest";
import { decide } from "../src/decide.js";
import { at, D, input, policy, promise } from "./fixtures.js";

/**
 * One test per guard: it fires when it should, AND it shadows the guard below it.
 * The shadowing tests are the ones that protect the ORDER, which is the actual design.
 * See docs/04-collections-engine.md §3.
 */

const NOW = at("2026-11-20", 10); // well past every rung offset, a Friday

describe("guard 1 — invoice paid", () => {
  it("stops on PAID", () => {
    expect(decide(input({ invoice: { status: "PAID" } }), NOW))
      .toEqual({ action: "STOP", reason: "invoice_paid" });
  });

  it("stops when the balance is zero even if status lags behind", () => {
    const i = input({ invoice: { status: "OPEN", paidPaise: 42_000_000n } });
    expect(decide(i, NOW)).toEqual({ action: "STOP", reason: "invoice_paid" });
  });

  it("stops on an overpayment", () => {
    const i = input({ invoice: { status: "OPEN", paidPaise: 50_000_000n } });
    expect(decide(i, NOW)).toEqual({ action: "STOP", reason: "invoice_paid" });
  });

  it("shadows every other stop condition", () => {
    const i = input({
      invoice: { status: "PAID" },
      contact: { optedOutAt: at("2026-10-01") },
      buyer: { isPaused: true },
      disputes: [{ status: "OPEN" }],
      lastInbound: { intent: "HOSTILE", receivedAt: at("2026-11-01") },
    });
    expect(decide(i, NOW).reason).toBe("invoice_paid");
  });
});

describe("guard 2 — invoice closed", () => {
  it.each(["WRITTEN_OFF", "ON_HOLD"] as const)("stops on %s", (status) => {
    expect(decide(input({ invoice: { status } }), NOW))
      .toEqual({ action: "STOP", reason: "invoice_closed" });
  });

  it("shadows opt-out", () => {
    const i = input({
      invoice: { status: "ON_HOLD" },
      contact: { optedOutAt: at("2026-10-01") },
    });
    expect(decide(i, NOW).reason).toBe("invoice_closed");
  });
});

describe("guard 3 — contact opted out", () => {
  it("stops, because a STOP from a buyer is a hard WhatsApp policy obligation", () => {
    expect(decide(input({ contact: { optedOutAt: at("2026-10-01") } }), NOW))
      .toEqual({ action: "STOP", reason: "contact_opted_out" });
  });

  it("outranks hostility, an open dispute and a pending promise", () => {
    const i = input({
      contact: { optedOutAt: at("2026-10-01") },
      buyer: { isPaused: true },
      disputes: [{ status: "OPEN" }],
      lastInbound: { intent: "HOSTILE", receivedAt: at("2026-11-01") },
      promises: [promise({ promisedDate: D("2026-12-01") })],
    });
    expect(decide(i, NOW).reason).toBe("contact_opted_out");
  });
});

describe("guard 4 — buyer paused", () => {
  it("stops", () => {
    expect(decide(input({ buyer: { isPaused: true } }), NOW))
      .toEqual({ action: "STOP", reason: "buyer_paused" });
  });

  it("shadows hostility", () => {
    const i = input({
      buyer: { isPaused: true },
      lastInbound: { intent: "HOSTILE", receivedAt: at("2026-11-01") },
    });
    expect(decide(i, NOW).reason).toBe("buyer_paused");
  });
});

describe("guard 5 — hostile buyer", () => {
  it("hands off to the owner with high urgency", () => {
    const i = input({ lastInbound: { intent: "HOSTILE", receivedAt: at("2026-11-01") } });
    expect(decide(i, NOW))
      .toEqual({ action: "HANDOFF_TO_OWNER", reason: "buyer_hostile", urgency: "HIGH" });
  });

  it("outranks a dispute, because hostility needs the owner today", () => {
    const i = input({
      disputes: [{ status: "OPEN" }],
      lastInbound: { intent: "HOSTILE", receivedAt: at("2026-11-01") },
    });
    expect(decide(i, NOW)).toMatchObject({ reason: "buyer_hostile", urgency: "HIGH" });
  });

  it("is skipped when the org has turned off pauseOnHostile", () => {
    const i = input({
      lastInbound: { intent: "HOSTILE", receivedAt: at("2026-11-01") },
      policy: policy({ pauseOnHostile: false }),
    });
    expect(decide(i, NOW).action).not.toBe("HANDOFF_TO_OWNER");
  });

  it("does not fire when the most recent inbound is no longer hostile", () => {
    const i = input({
      lastInbound: { intent: "PROMISE_TO_PAY", receivedAt: at("2026-11-02") },
    });
    expect(decide(i, NOW).reason).not.toBe("buyer_hostile");
  });
});

describe("guard 6 — dispute open", () => {
  it("hands off on an open dispute row", () => {
    expect(decide(input({ disputes: [{ status: "OPEN" }] }), NOW))
      .toEqual({ action: "HANDOFF_TO_OWNER", reason: "dispute_open", urgency: "NORMAL" });
  });

  it("hands off on DISPUTED invoice status", () => {
    expect(decide(input({ invoice: { status: "DISPUTED" } }), NOW).reason)
      .toBe("dispute_open");
  });

  it("ignores resolved disputes", () => {
    const i = input({ disputes: [{ status: "RESOLVED" }] });
    expect(decide(i, NOW).reason).not.toBe("dispute_open");
  });

  it("shadows an explicit ladder pause", () => {
    const i = input({
      disputes: [{ status: "OPEN" }],
      invoice: { ladderPausedUntil: at("2026-12-01") },
    });
    expect(decide(i, NOW).reason).toBe("dispute_open");
  });
});

describe("guard 7 — ladder paused", () => {
  it("waits until the pause expires", () => {
    const until = at("2026-12-01", 10);
    expect(decide(input({ invoice: { ladderPausedUntil: until } }), NOW))
      .toEqual({ action: "WAIT", until, reason: "ladder_paused" });
  });

  it("ignores a pause that has already expired", () => {
    const i = input({ invoice: { ladderPausedUntil: at("2026-11-01") } });
    expect(decide(i, NOW).reason).not.toBe("ladder_paused");
  });

  it("shadows a pending promise", () => {
    const i = input({
      invoice: { ladderPausedUntil: at("2026-12-01") },
      promises: [promise({ promisedDate: D("2026-12-20") })],
    });
    expect(decide(i, NOW).reason).toBe("ladder_paused");
  });
});

describe("guard 9 — below the minimum", () => {
  it("stops on a trivial balance", () => {
    const i = input({ invoice: { amountPaise: 50_000n } }); // ₹500 < ₹1,000 floor
    expect(decide(i, NOW)).toEqual({ action: "STOP", reason: "below_min_amount" });
  });

  it("sends at exactly the minimum", () => {
    const i = input({ invoice: { amountPaise: 100_000n } });
    expect(decide(i, NOW).action).toBe("REQUEST_APPROVAL"); // rung 6 by this date
  });

  it("uses the outstanding balance, not the invoice face value", () => {
    const i = input({
      invoice: { amountPaise: 42_000_000n, paidPaise: 41_999_000n }, // ₹10 left
    });
    expect(decide(i, NOW).reason).toBe("below_min_amount");
  });

  it("does not shadow an opt-out", () => {
    const i = input({
      invoice: { amountPaise: 50_000n },
      contact: { optedOutAt: at("2026-10-01") },
    });
    expect(decide(i, NOW).reason).toBe("contact_opted_out");
  });
});

describe("guard 11 — legal approval", () => {
  it("requests approval instead of sending rung 5", () => {
    const now = at("2026-11-16", 10); // D+33, a Monday
    expect(decide(input(), now))
      .toEqual({ action: "REQUEST_APPROVAL", rung: 5, reason: "needs_legal_approval" });
  });

  it("sends once the owner has approved", () => {
    const now = at("2026-11-16", 10);
    const i = input({ invoice: { legalApprovedAt: at("2026-11-15") } });
    expect(decide(i, now)).toMatchObject({ action: "SEND", rung: 5 });
  });

  it("respects a per-buyer ceiling below the org default", () => {
    const now = at("2026-10-30", 10); // D+16 -> rung 4, a Friday
    const i = input({ buyer: { maxRungOverride: 3 } });
    expect(decide(i, now))
      .toEqual({ action: "REQUEST_APPROVAL", rung: 4, reason: "needs_legal_approval" });
  });

  it("sends rung 4 normally without a buyer override", () => {
    const now = at("2026-10-30", 10);
    expect(decide(input(), now)).toMatchObject({ action: "SEND", rung: 4 });
  });

  it("is shadowed by quiet hours only after approval is granted", () => {
    // Approval is a decision the owner must see; it must not be deferred by quiet hours.
    const night = at("2026-11-16", 23);
    expect(decide(input(), night).action).toBe("REQUEST_APPROVAL");
  });
});

describe("guard 12 — quiet hours and weekends", () => {
  it("defers a 23:00 send to 09:00 the next morning", () => {
    const now = at("2026-10-30", 23); // Friday night
    const d = decide(input(), now);
    expect(d).toMatchObject({ action: "WAIT", reason: "quiet_hours" });
    if (d.action !== "WAIT") throw new Error("unreachable");
    // Saturday 09:00 is still a weekend, so it lands on Monday.
    expect(d.until).toEqual(at("2026-11-02", 9));
  });

  it("defers a 03:00 send to 09:00 the same morning", () => {
    const now = at("2026-10-30", 3); // Friday pre-dawn
    const d = decide(input(), now);
    if (d.action !== "WAIT") throw new Error(`expected WAIT, got ${d.action}`);
    expect(d.until).toEqual(at("2026-10-30", 9));
  });

  it("skips the weekend", () => {
    const now = at("2026-10-31", 10); // Saturday
    const d = decide(input(), now);
    if (d.action !== "WAIT") throw new Error(`expected WAIT, got ${d.action}`);
    expect(d.until).toEqual(at("2026-11-02", 9)); // Monday
  });

  it("sends on a Saturday when the org allows weekends", () => {
    const now = at("2026-10-31", 10);
    const i = input({ policy: policy({ sendOnWeekends: true }) });
    expect(decide(i, now).action).toBe("SEND");
  });

  it("sends at any hour when quiet hours are disabled", () => {
    const now = at("2026-10-30", 3);
    const i = input({ policy: policy({ quietStartHourIst: 9, quietEndHourIst: 9 }) });
    expect(decide(i, now).action).toBe("SEND");
  });
});

describe("guard 13 — send", () => {
  it("emits the template id, variant and language", () => {
    const now = at("2026-10-22", 10); // D+8 -> rung 3, a Thursday
    expect(decide(input(), now)).toEqual({
      action: "SEND",
      rung: 3,
      template: "bakaya_r3_standard_hi",
      variant: "STANDARD",
      language: "hi",
      reason: "due_date_passed",
    });
  });

  it("prefers the buyer's language over the org default", () => {
    const now = at("2026-10-22", 10);
    const i = input({ buyer: { preferredLanguage: "pa" } });
    expect(decide(i, now)).toMatchObject({
      language: "pa",
      template: "bakaya_r3_standard_pa",
    });
  });
});
