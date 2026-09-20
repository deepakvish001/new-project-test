import type { IstDate } from "./ist.js";

export type InvoiceStatus =
  | "OPEN" | "PARTIALLY_PAID" | "PAID" | "DISPUTED" | "WRITTEN_OFF" | "ON_HOLD";

export type PromiseStatus = "PENDING" | "KEPT" | "BROKEN" | "SUPERSEDED";

export type DisputeStatus = "OPEN" | "RESOLVED" | "ESCALATED";

export type Intent =
  | "PROMISE_TO_PAY" | "ALREADY_PAID" | "DISPUTE" | "NEEDS_DOCUMENT"
  | "PARTIAL_PAYMENT" | "WRONG_NUMBER" | "HOSTILE" | "UNCLEAR" | "OTHER";

export type Tone = "GENTLE" | "STANDARD" | "FIRM";

export type MessageVariant = "STANDARD" | "BROKEN_PROMISE";

/**
 * Stable machine-readable reason codes. These are persisted to `ladder_event.reason`,
 * so they are queryable and must not be reworded casually.
 */
export type Reason =
  | "invoice_paid"
  | "invoice_closed"
  | "contact_opted_out"
  | "buyer_paused"
  | "buyer_hostile"
  | "dispute_open"
  | "ladder_paused"
  | "promise_pending"
  | "below_min_amount"
  | "rung_already_sent"
  | "ladder_exhausted"
  | "needs_legal_approval"
  | "quiet_hours"
  | "due_date_passed"
  | "promise_broken";

export interface PromiseRecord {
  readonly promisedDate: IstDate;
  readonly promisedPaise: bigint | null;
  readonly status: PromiseStatus;
  /** Which rung the ladder was on when this promise was made. Caps repeat pauses. */
  readonly createdAtRung: number;
  readonly createdAt: Date;
}

export interface DisputeRecord {
  readonly status: DisputeStatus;
}

export interface OrgPolicy {
  readonly tone: Tone;
  /**
   * Days relative to the due date at which each rung fires; index 0 is rung 1.
   * `null` disables that rung. Default: [-3, 0, 7, 15, 30, 45].
   */
  readonly rungOffsetsDays: readonly (number | null)[];
  /** Rungs above this require an explicit per-invoice human approval. */
  readonly maxAutoRung: number;
  readonly quietStartHourIst: number;
  readonly quietEndHourIst: number;
  readonly sendOnWeekends: boolean;
  readonly minInvoicePaise: bigint;
  readonly pauseOnHostile: boolean;
  readonly defaultLanguage: string;
}

export interface LadderInput {
  readonly invoice: {
    readonly dueDate: IstDate;
    readonly amountPaise: bigint;
    readonly paidPaise: bigint;
    readonly status: InvoiceStatus;
    readonly currentRung: number;
    readonly ladderPausedUntil: Date | null;
    readonly legalApprovedAt: Date | null;
  };
  readonly buyer: {
    readonly isPaused: boolean;
    readonly maxRungOverride: number | null;
    readonly preferredLanguage: string | null;
  };
  readonly contact: {
    readonly optedOutAt: Date | null;
  };
  /** Newest first is conventional but not required; the engine does not assume order. */
  readonly promises: readonly PromiseRecord[];
  readonly disputes: readonly DisputeRecord[];
  readonly lastInbound: { readonly intent: Intent; readonly receivedAt: Date } | null;
  readonly policy: OrgPolicy;
}

export type LadderDecision =
  | {
      readonly action: "SEND";
      readonly rung: number;
      readonly template: string;
      readonly variant: MessageVariant;
      readonly language: string;
      readonly reason: Reason;
    }
  | { readonly action: "WAIT"; readonly until: Date; readonly reason: Reason }
  | { readonly action: "REQUEST_APPROVAL"; readonly rung: number; readonly reason: Reason }
  | {
      readonly action: "HANDOFF_TO_OWNER";
      readonly reason: Reason;
      readonly urgency: "NORMAL" | "HIGH";
    }
  | { readonly action: "STOP"; readonly reason: Reason };
