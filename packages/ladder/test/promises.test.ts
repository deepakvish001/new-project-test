import { describe, expect, it } from "vitest";
import { decide, MAX_PROMISE_PAUSES_PER_RUNG } from "../src/decide";
import { at, D, input, promise } from "./fixtures";

/**
 * Guard 8. The highest-value behaviour in the product: a buyer who said "20th ko de dunga"
 * must not be chased on the 18th. Breaking this makes the owner look incompetent to their
 * own customer, which is how the account churns.
 */

describe("pending promise suppresses the next rung", () => {
  it("waits until the day after the promised date", () => {
    const now = at("2026-10-21", 10); // rung 3 would otherwise fire
    const i = input({ promises: [promise({ promisedDate: D("2026-10-25") })] });
    const d = decide(i, now);
    expect(d).toMatchObject({ action: "WAIT", reason: "promise_pending" });
    if (d.action !== "WAIT") throw new Error("unreachable");
    expect(d.until).toEqual(at("2026-10-26", 0));
  });

  it("still holds on the promised date itself", () => {
    const now = at("2026-10-25", 10);
    const i = input({ promises: [promise({ promisedDate: D("2026-10-25") })] });
    expect(decide(i, now).reason).toBe("promise_pending");
  });

  it("stops holding the day after", () => {
    const now = at("2026-10-26", 10);
    const i = input({ promises: [promise({ promisedDate: D("2026-10-25") })] });
    expect(decide(i, now).reason).not.toBe("promise_pending");
  });

  it("ignores promises that are not PENDING", () => {
    const now = at("2026-10-21", 10);
    for (const status of ["KEPT", "BROKEN", "SUPERSEDED"] as const) {
      const i = input({
        promises: [promise({ status, promisedDate: D("2026-12-01") })],
      });
      expect(decide(i, now).reason).not.toBe("promise_pending");
    }
  });

  it("honours the newest pending promise when several exist", () => {
    const now = at("2026-10-21", 10);
    const i = input({
      promises: [
        promise({ promisedDate: D("2026-10-24"), createdAt: at("2026-10-15", 9) }),
        promise({ promisedDate: D("2026-10-28"), createdAt: at("2026-10-20", 9) }),
      ],
    });
    const d = decide(i, now);
    if (d.action !== "WAIT") throw new Error(`expected WAIT, got ${d.action}`);
    expect(d.until).toEqual(at("2026-10-29", 0));
  });

  it("does not depend on the order promises are supplied in", () => {
    const now = at("2026-10-21", 10);
    const a = promise({ promisedDate: D("2026-10-24"), createdAt: at("2026-10-15", 9) });
    const b = promise({ promisedDate: D("2026-10-28"), createdAt: at("2026-10-20", 9) });
    expect(decide(input({ promises: [a, b] }), now))
      .toEqual(decide(input({ promises: [b, a] }), now));
  });
});

describe("per-rung pause cap", () => {
  const madeAtRung = (n: number, rung: number) =>
    Array.from({ length: n }, (_, i) =>
      promise({
        createdAtRung: rung,
        promisedDate: D("2026-12-01"),
        createdAt: at("2026-10-16", 9 + i),
      }));

  it("allows the first two promises at a rung to pause the ladder", () => {
    const now = at("2026-10-21", 10);
    for (const n of [1, MAX_PROMISE_PAUSES_PER_RUNG]) {
      const i = input({
        invoice: { currentRung: 2 },
        promises: madeAtRung(n, 2),
      });
      expect(decide(i, now).reason).toBe("promise_pending");
    }
  });

  it("ignores the third promise at the same rung, so the ladder advances", () => {
    const now = at("2026-10-21", 10);
    const i = input({
      invoice: { currentRung: 2 },
      promises: madeAtRung(MAX_PROMISE_PAUSES_PER_RUNG + 1, 2),
    });
    expect(decide(i, now)).toMatchObject({ action: "SEND", rung: 3 });
  });

  it("resets the budget once the ladder has moved to a new rung", () => {
    const now = at("2026-10-29", 10); // rung 4 territory
    const i = input({
      invoice: { currentRung: 3 },
      promises: [
        ...madeAtRung(3, 2),                                  // spent at rung 2
        promise({ createdAtRung: 3, promisedDate: D("2026-12-01") }),
      ],
    });
    expect(decide(i, now).reason).toBe("promise_pending");
  });
});

describe("broken-promise variant", () => {
  it("selects the broken-promise template when the last promise was broken", () => {
    const now = at("2026-10-22", 10);
    const i = input({
      promises: [promise({ status: "BROKEN", createdAt: at("2026-10-15", 10) })],
    });
    expect(decide(i, now)).toMatchObject({
      action: "SEND",
      variant: "BROKEN_PROMISE",
      template: "bakaya_r4_broken_promise_hi",
      reason: "promise_broken",
    });
  });

  it("returns to the standard variant once a newer promise is pending again", () => {
    const now = at("2026-10-22", 10);
    const i = input({
      invoice: { currentRung: 3 },
      promises: [
        promise({ status: "BROKEN", createdAt: at("2026-10-15", 10) }),
        promise({
          status: "KEPT",
          createdAt: at("2026-10-20", 10),
          promisedDate: D("2026-10-20"),
        }),
      ],
    });
    expect(decide(i, now)).toMatchObject({ variant: "STANDARD" });
  });
});
