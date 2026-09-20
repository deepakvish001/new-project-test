import { describe, expect, it } from "vitest";
import { decide, targetRung, templateId } from "../src/decide.js";
import { at, D, input, policy, promise } from "./fixtures.js";

const DUE = D("2026-10-14");

describe("targetRung — the offset table", () => {
  it.each([
    ["2026-10-10", 0, "before rung 1"],
    ["2026-10-11", 1, "D-3 pre-due courtesy"],
    ["2026-10-13", 1, "still rung 1"],
    ["2026-10-14", 2, "D+0 due today"],
    ["2026-10-20", 2, "D+6 still rung 2"],
    ["2026-10-21", 3, "D+7 gentle"],
    ["2026-10-29", 4, "D+15 firm"],
    ["2026-11-13", 5, "D+30 43B(h)"],
    ["2026-11-28", 6, "D+45 MSMED"],
    ["2027-03-01", 6, "never exceeds the last rung"],
  ] as const)("%s -> rung %i (%s)", (date, expected, _note) => {
    expect(targetRung(DUE, at(date, 10), [], policy())).toBe(expected);
  });

  it("honours a disabled rung", () => {
    const p = policy({ rungOffsetsDays: [-3, 0, null, 15, 30, 45] });
    expect(targetRung(DUE, at("2026-10-21", 10), [], p)).toBe(2); // rung 3 disabled
    expect(targetRung(DUE, at("2026-10-29", 10), [], p)).toBe(4);
  });

  it("is independent of the hour of day", () => {
    for (const h of [0, 9, 13, 23]) {
      expect(targetRung(DUE, at("2026-10-21", h), [], policy())).toBe(3);
    }
  });
});

describe("targetRung — broken-promise acceleration", () => {
  const broken = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      promise({ status: "BROKEN", createdAt: at("2026-10-15", 10 + i) }));

  it("advances one rung per broken promise", () => {
    const now = at("2026-10-21", 10); // time-based rung 3
    expect(targetRung(DUE, now, broken(1), policy())).toBe(4);
  });

  it("caps acceleration at two rungs", () => {
    const now = at("2026-10-21", 10);
    expect(targetRung(DUE, now, broken(2), policy())).toBe(5);
    expect(targetRung(DUE, now, broken(5), policy())).toBe(5); // still +2, not +5
  });

  it("cannot push past the last configured rung", () => {
    const now = at("2026-11-28", 10); // already rung 6
    expect(targetRung(DUE, now, broken(2), policy())).toBe(6);
  });

  it("ignores promises that are pending or kept", () => {
    const now = at("2026-10-21", 10);
    const ps = [promise({ status: "KEPT" }), promise({ status: "SUPERSEDED" })];
    expect(targetRung(DUE, now, ps, policy())).toBe(3);
  });

  it("still requires human approval to reach a legal rung", () => {
    const now = at("2026-10-29", 10); // rung 4 by time, +2 broken = rung 6
    const i = input({ promises: broken(2) });
    expect(decide(i, now))
      .toEqual({ action: "REQUEST_APPROVAL", rung: 6, reason: "needs_legal_approval" });
  });
});

describe("guard 10 — rung already sent", () => {
  it("waits for the next rung's date instead of re-sending", () => {
    const now = at("2026-10-22", 10); // rung 3 territory, rung 3 already sent
    const d = decide(input({ invoice: { currentRung: 3 } }), now);
    expect(d).toMatchObject({ action: "WAIT", reason: "rung_already_sent" });
    if (d.action !== "WAIT") throw new Error("unreachable");
    expect(d.until).toEqual(at("2026-10-29", 0)); // D+15, rung 4
  });

  it("skips over a disabled rung when computing the next date", () => {
    const p = policy({ rungOffsetsDays: [-3, 0, 7, null, 30, 45] });
    const now = at("2026-10-22", 10);
    const d = decide(input({ invoice: { currentRung: 3 }, policy: p }), now);
    if (d.action !== "WAIT") throw new Error(`expected WAIT, got ${d.action}`);
    expect(d.until).toEqual(at("2026-11-13", 0)); // D+30, rung 5
  });

  it("stops when the last rung has been sent", () => {
    const now = at("2026-12-20", 10);
    expect(decide(input({ invoice: { currentRung: 6 } }), now))
      .toEqual({ action: "STOP", reason: "ladder_exhausted" });
  });

  it("stops when every remaining rung is disabled", () => {
    const p = policy({ rungOffsetsDays: [-3, 0, 7, null, null, null] });
    const now = at("2026-12-20", 10);
    expect(decide(input({ invoice: { currentRung: 3 }, policy: p }), now))
      .toEqual({ action: "STOP", reason: "ladder_exhausted" });
  });

  it("does not request approval for a rung already sent", () => {
    const now = at("2026-11-16", 10);
    const i = input({ invoice: { currentRung: 5, legalApprovedAt: at("2026-11-15") } });
    expect(decide(i, now).action).toBe("WAIT");
  });
});

describe("templateId", () => {
  it("follows the docs/05 naming scheme", () => {
    expect(templateId(4, "BROKEN_PROMISE", "hi")).toBe("bakaya_r4_broken_promise_hi");
    expect(templateId(1, "STANDARD", "gu")).toBe("bakaya_r1_standard_gu");
  });
});
