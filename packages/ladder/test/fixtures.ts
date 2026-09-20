import { instantAt, istDate, type IstDate } from "../src/ist";
import type { LadderInput, OrgPolicy, PromiseRecord } from "../src/types";

export const D = istDate;

/** An instant at a given IST hour on a given IST date. */
export function at(date: string, hourIst = 10): Date {
  return instantAt(istDate(date), hourIst);
}

export const DEFAULT_POLICY: OrgPolicy = {
  tone: "STANDARD",
  rungOffsetsDays: [-3, 0, 7, 15, 30, 45],
  maxAutoRung: 4,
  quietStartHourIst: 21,
  quietEndHourIst: 9,
  sendOnWeekends: false,
  minInvoicePaise: 100_000n, // ₹1,000
  pauseOnHostile: true,
  defaultLanguage: "hi",
};

export function policy(overrides: Partial<OrgPolicy> = {}): OrgPolicy {
  return { ...DEFAULT_POLICY, ...overrides };
}

export function promise(overrides: Partial<PromiseRecord> = {}): PromiseRecord {
  return {
    promisedDate: D("2026-10-25"),
    promisedPaise: null,
    status: "PENDING",
    createdAtRung: 2,
    createdAt: at("2026-10-14", 12),
    ...overrides,
  };
}

interface InputOverrides {
  invoice?: Partial<LadderInput["invoice"]>;
  buyer?: Partial<LadderInput["buyer"]>;
  contact?: Partial<LadderInput["contact"]>;
  promises?: readonly PromiseRecord[];
  disputes?: LadderInput["disputes"];
  lastInbound?: LadderInput["lastInbound"];
  policy?: OrgPolicy;
}

/** A ₹4,20,000 invoice due 14 Oct 2026 — the worked example in docs/04 §7. */
export function input(o: InputOverrides = {}): LadderInput {
  return {
    invoice: {
      dueDate: D("2026-10-14") as IstDate,
      amountPaise: 42_000_000n,
      paidPaise: 0n,
      status: "OPEN",
      currentRung: 0,
      ladderPausedUntil: null,
      legalApprovedAt: null,
      ...o.invoice,
    },
    buyer: {
      isPaused: false,
      maxRungOverride: null,
      preferredLanguage: null,
      ...o.buyer,
    },
    contact: { optedOutAt: null, ...o.contact },
    promises: o.promises ?? [],
    disputes: o.disputes ?? [],
    lastInbound: o.lastInbound ?? null,
    policy: o.policy ?? DEFAULT_POLICY,
  };
}
