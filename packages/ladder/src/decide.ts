import {
  addDays,
  dateOfInstant,
  dayIndex,
  daysSince,
  hourOfInstant,
  instantAt,
  isQuietHour,
  isWeekend,
  type IstDate,
} from "./ist";
import type {
  LadderDecision,
  LadderInput,
  MessageVariant,
  OrgPolicy,
  PromiseRecord,
} from "./types";

/**
 * A broken promise accelerates the ladder by one rung, capped so that a buyer who breaks
 * many promises cannot be pushed past the legal rungs by arithmetic alone — those still
 * require an explicit human approval.
 */
export const MAX_BROKEN_PROMISE_ACCELERATION = 2;

/**
 * A buyer can otherwise keep promising and the ladder never advances. Two pauses per rung
 * is the cap; the third promise at the same rung does not buy more time.
 */
export const MAX_PROMISE_PAUSES_PER_RUNG = 2;

/** Bounded so a pathological policy cannot spin. 30 hops covers a long weekend easily. */
const MAX_SEND_WINDOW_HOPS = 30;

/**
 * Decide what to do with one invoice, right now.
 *
 * Pure: no I/O, no clock access, no randomness. Calling it twice with the same input and
 * the same `now` returns the same decision — the property the send path's idempotency
 * key relies on.
 *
 * Guards are evaluated in a fixed order and the first match wins. The order is the design:
 * it encodes what matters more than what. See docs/04-collections-engine.md §3.
 */
export function decide(input: LadderInput, now: Date): LadderDecision {
  const { invoice, buyer, contact, promises, disputes, lastInbound, policy } = input;
  const outstanding = invoice.amountPaise - invoice.paidPaise;

  // 1. Already settled. `outstanding <= 0` is checked too: a payment can land before the
  //    status column catches up, and dunning a paid invoice is the worst thing we can do.
  if (invoice.status === "PAID" || outstanding <= 0n) {
    return { action: "STOP", reason: "invoice_paid" };
  }

  // 2. Closed by a human decision.
  if (invoice.status === "WRITTEN_OFF" || invoice.status === "ON_HOLD") {
    return { action: "STOP", reason: "invoice_closed" };
  }

  // 3. Opt-out outranks everything commercial. A STOP from a buyer is a hard WhatsApp
  //    policy obligation, and the sender number is the whole channel.
  if (contact.optedOutAt !== null) {
    return { action: "STOP", reason: "contact_opted_out" };
  }

  // 4. Owner has paused this buyer.
  if (buyer.isPaused) {
    return { action: "STOP", reason: "buyer_paused" };
  }

  // 5. Hostility before dispute: both stop the ladder, but this one needs the owner today.
  //    Asymmetric costs — a false positive costs one handoff, a false negative costs a
  //    trading relationship.
  if (policy.pauseOnHostile && lastInbound?.intent === "HOSTILE") {
    return { action: "HANDOFF_TO_OWNER", reason: "buyer_hostile", urgency: "HIGH" };
  }

  // 6. Never dun a disputed invoice.
  if (invoice.status === "DISPUTED" || disputes.some((d) => d.status === "OPEN")) {
    return { action: "HANDOFF_TO_OWNER", reason: "dispute_open", urgency: "NORMAL" };
  }

  // 7. Explicit pause set by another job (e.g. an ALREADY_PAID claim pending reconcile).
  if (invoice.ladderPausedUntil !== null && invoice.ladderPausedUntil > now) {
    return { action: "WAIT", until: invoice.ladderPausedUntil, reason: "ladder_paused" };
  }

  // 8. A buyer who said "20th ko de dunga" must not be chased on the 18th. This is the
  //    single highest-value behaviour in the product — breaking it makes the owner look
  //    incompetent to their own customer.
  const pause = promiseToHonour(promises, invoice.currentRung, now);
  if (pause !== null) {
    return {
      action: "WAIT",
      until: instantAt(addDays(pause.promisedDate, 1), 0),
      reason: "promise_pending",
    };
  }

  // 9. Not worth a message.
  if (outstanding < policy.minInvoicePaise) {
    return { action: "STOP", reason: "below_min_amount" };
  }

  const target = targetRung(invoice.dueDate, now, promises, policy);

  // 10. Nothing new is due. Wait for the next rung's date rather than re-sending the one
  //     already sent. (Not in the original spec — found while implementing; the send-layer
  //     idempotency key would have masked it as a silent no-op every tick.)
  if (target <= invoice.currentRung) {
    const next = nextScheduledRung(invoice.currentRung, policy);
    if (next === null) {
      return { action: "STOP", reason: "ladder_exhausted" };
    }
    return {
      action: "WAIT",
      until: instantAt(addDays(invoice.dueDate, next.offset), 0),
      reason: "rung_already_sent",
    };
  }

  // 11. Legal rungs never fire without a per-invoice human approval.
  const ceiling = Math.min(
    policy.maxAutoRung,
    buyer.maxRungOverride ?? Number.POSITIVE_INFINITY,
  );
  if (target > ceiling && invoice.legalApprovedAt === null) {
    return { action: "REQUEST_APPROVAL", rung: target, reason: "needs_legal_approval" };
  }

  // 12. Quiet hours and weekends only delay a send — which is why they sit below the
  //     guards that stop one, and below the approval request the owner needs to see.
  if (!canSendAt(now, policy)) {
    // Distinct reasons: "it is 2am" and "it is Sunday" read very differently in a digest
    // and in ladder_event, even though both only delay the send.
    const reason = !policy.sendOnWeekends && isWeekend(now) ? "weekend" : "quiet_hours";
    return { action: "WAIT", until: nextSendWindow(now, policy), reason };
  }

  // 13. Send.
  const variant: MessageVariant = mostRecentPromise(promises)?.status === "BROKEN"
    ? "BROKEN_PROMISE"
    : "STANDARD";
  const language = buyer.preferredLanguage ?? policy.defaultLanguage;

  return {
    action: "SEND",
    rung: target,
    template: templateId(target, variant, language),
    variant,
    language,
    reason: variant === "BROKEN_PROMISE" ? "promise_broken" : "due_date_passed",
  };
}

/** Template naming per docs/05-whatsapp-layer.md §3: `bakaya_r{rung}_{variant}_{lang}`. */
export function templateId(
  rung: number,
  variant: MessageVariant,
  language: string,
): string {
  return `bakaya_r${rung}_${variant.toLowerCase()}_${language}`;
}

/**
 * The rung the ladder should be on, from elapsed time plus any broken-promise
 * acceleration. Never exceeds the number of configured rungs.
 */
export function targetRung(
  dueDate: IstDate,
  now: Date,
  promises: readonly PromiseRecord[],
  policy: OrgPolicy,
): number {
  const overdue = daysSince(dueDate, now);

  let byTime = 0;
  policy.rungOffsetsDays.forEach((offset, i) => {
    if (offset !== null && overdue >= offset) byTime = i + 1;
  });

  const broken = promises.reduce((n, p) => (p.status === "BROKEN" ? n + 1 : n), 0);
  const acceleration = Math.min(broken, MAX_BROKEN_PROMISE_ACCELERATION);

  return Math.min(byTime + acceleration, policy.rungOffsetsDays.length);
}

/**
 * The pending promise that should suppress the next rung, or `null`.
 *
 * Returns null once the per-rung pause cap is spent, so a buyer cannot stall the ladder
 * indefinitely by promising again each time it advances.
 */
function promiseToHonour(
  promises: readonly PromiseRecord[],
  currentRung: number,
  now: Date,
): PromiseRecord | null {
  const pausesUsed = promises.reduce(
    (n, p) => (p.createdAtRung === currentRung ? n + 1 : n),
    0,
  );
  if (pausesUsed > MAX_PROMISE_PAUSES_PER_RUNG) return null;

  const today = dayIndex(dateOfInstant(now));
  let best: PromiseRecord | null = null;
  for (const p of promises) {
    if (p.status !== "PENDING") continue;
    if (dayIndex(p.promisedDate) < today) continue; // lapsed; promise-check will break it
    if (best === null || p.createdAt > best.createdAt) best = p;
  }
  return best;
}

function mostRecentPromise(promises: readonly PromiseRecord[]): PromiseRecord | null {
  let best: PromiseRecord | null = null;
  for (const p of promises) {
    if (best === null || p.createdAt > best.createdAt) best = p;
  }
  return best;
}

/** The next enabled rung after `currentRung`, with its day offset, or null if exhausted. */
function nextScheduledRung(
  currentRung: number,
  policy: OrgPolicy,
): { rung: number; offset: number } | null {
  for (let rung = currentRung + 1; rung <= policy.rungOffsetsDays.length; rung++) {
    const offset = policy.rungOffsetsDays[rung - 1];
    if (offset !== null && offset !== undefined) return { rung, offset };
  }
  return null;
}

export function canSendAt(instant: Date, policy: OrgPolicy): boolean {
  if (!policy.sendOnWeekends && isWeekend(instant)) return false;
  return !isQuietHour(
    hourOfInstant(instant),
    policy.quietStartHourIst,
    policy.quietEndHourIst,
  );
}

/** The first instant at or after `from` at which a send is permitted. */
export function nextSendWindow(from: Date, policy: OrgPolicy): Date {
  let cursor = from;
  for (let hop = 0; hop < MAX_SEND_WINDOW_HOPS; hop++) {
    if (canSendAt(cursor, policy)) return cursor;
    cursor = !policy.sendOnWeekends && isWeekend(cursor)
      ? startOfNextDay(cursor, policy.quietEndHourIst)
      : nextQuietEnd(cursor, policy);
  }
  // Unreachable: quietStart === quietEnd disables quiet hours, so no policy can block
  // every hour of every day. Kept as a loud failure in preference to a silent hang.
  /* c8 ignore start */
  throw new Error(
    `No send window within ${MAX_SEND_WINDOW_HOPS} hops — check org policy hours`,
  );
  /* c8 ignore stop */
}

function startOfNextDay(instant: Date, hourIst: number): Date {
  return instantAt(addDays(dateOfInstant(instant), 1), hourIst);
}

/** The next instant at which the quiet window ends. */
function nextQuietEnd(instant: Date, policy: OrgPolicy): Date {
  const today = dateOfInstant(instant);
  const endToday = instantAt(today, policy.quietEndHourIst);
  return endToday > instant ? endToday : startOfNextDay(instant, policy.quietEndHourIst);
}
