# 04 — Collections Engine

The escalation state machine. Lives in `packages/ladder`, has **zero I/O**, and is the one
part of this system that must be exhaustively tested.

## 1. The ladder

Offsets are relative to `invoice.due_date` and are configurable per org
(`org_policy.rung_offsets_days`). Defaults:

| Rung | Day | Name | Tone | Auto? |
|---|---|---|---|---|
| 0 | — | Dormant | — | — |
| 1 | D−3 | **Pre-due courtesy** | Friendly, informational. "Invoice due on the 14th, here's the copy + link." | ✅ |
| 2 | D+0 | **Due today** | Neutral reminder. | ✅ |
| 3 | D+7 | **Gentle follow-up** | Polite, asks for a payment date. | ✅ |
| 4 | D+15 | **Firm follow-up** | Names the amount and days overdue. Asks for a committed date. | ✅ |
| 5 | D+30 | **43B(h) intimation** | Notes the buyer's tax-deduction exposure. Formal letter attached. | 🔒 Owner approval |
| 6 | D+45 | **MSMED interest claim** | Sec-16 compound interest computed and claimed. | 🔒 Owner approval |

Rungs 1–4 run themselves. **Rungs 5 and 6 never fire without a per-invoice human
approval** — enforced in the engine *and* by `org_policy.max_auto_rung`, because the same
rule stated once is a rule you eventually break.

Rung 1 matters more than it looks. A pre-due courtesy message is not dunning — it is
useful, it gets a high reply rate, and it opens a service window cheaply so later rungs
land in an existing conversation.

## 2. The decision function

```typescript
// packages/ladder/src/decide.ts — pure, no I/O, no clock access
export function decide(input: LadderInput, now: Date): LadderDecision;

interface LadderInput {
  invoice:  { dueDate: IstDate;          // 'YYYY-MM-DD', not a Date — see below
              amountPaise: bigint; paidPaise: bigint;
              status: InvoiceStatus; currentRung: number;
              ladderPausedUntil: Date | null; legalApprovedAt: Date | null };
  buyer:    { isPaused: boolean; maxRungOverride: number | null;
              preferredLanguage: string | null };
  contact:  { optedOutAt: Date | null }; // guard 3 needs this
  promises: PromiseRecord[];    // order-independent; the engine sorts by createdAt
  disputes: Dispute[];
  lastInbound: { intent: Intent; receivedAt: Date } | null;
  policy:   OrgPolicy;
}

type LadderDecision =
  | { action: 'SEND';           rung: number; template: string; language: string;
                                variant: 'STANDARD' | 'BROKEN_PROMISE'; reason: Reason }
  | { action: 'WAIT';           until: Date;  reason: Reason }
  | { action: 'REQUEST_APPROVAL'; rung: number; reason: Reason }
  | { action: 'HANDOFF_TO_OWNER'; reason: Reason; urgency: 'NORMAL' | 'HIGH' }
  | { action: 'STOP';           reason: Reason };
```

## 3. Guard order

Guards are evaluated **in this exact order** and the first match wins. The order is the
design — it encodes what matters more than what.

```
1.  invoice.status == PAID                          → STOP
2.  invoice.status in (WRITTEN_OFF, ON_HOLD)        → STOP
3.  contact.opted_out_at is set                     → STOP  (WhatsApp policy, non-negotiable)
4.  buyer.isPaused                                  → STOP
5.  lastInbound.intent == HOSTILE                   → HANDOFF_TO_OWNER (urgency HIGH)
6.  open dispute exists                             → HANDOFF_TO_OWNER
7.  ladderPausedUntil > now                         → WAIT
8.  pending promise with promisedDate >= today      → WAIT until promisedDate + 1 day
9.  outstanding < policy.minInvoicePaise            → STOP
10. targetRung <= invoice.currentRung               → WAIT until the next rung's date
                                                       (or STOP if none remain)
11. targetRung > effectiveMaxAutoRung
        and no legalApprovedAt                      → REQUEST_APPROVAL
12. now is inside quiet hours / weekend             → WAIT until next send window
        (distinct reasons: `quiet_hours` vs `weekend`)
13. otherwise                                       → SEND targetRung
```

### Why this order

- **Opt-out above everything business-related (3).** A `STOP` from a buyer is a hard
  WhatsApp policy obligation. Getting this wrong risks the phone number, which is the whole
  channel.
- **Hostile before dispute (5 before 6).** Both stop the ladder, but hostility needs the
  owner *today*; a dispute can wait for the digest.
- **Promise before rung escalation (8 before 10).** The single highest-value behaviour in
  the product: a buyer who said "20th ko de dunga" must not be chased on the 18th. Break
  this and the owner loses face with their customer and churns.
- **Already-sent before approval (10 before 11).** Added during implementation: without
  it, an invoice sitting at a legal rung re-requests approval on every tick, and an
  ordinary rung re-decides `SEND` every tick. The send layer's idempotency key would have
  swallowed the duplicate silently, so this never surfaces as a visible bug — it just
  fills the digest with repeat approval requests.
- **Quiet hours late (12).** It only delays a send; it should not suppress a `STOP` or an
  approval request that the owner needs to see.

## 4. Target rung calculation

```typescript
function targetRung(dueDate: Date, now: Date, policy: OrgPolicy): number {
  const days = daysBetweenIST(dueDate, now);      // IST, not UTC — see below
  let rung = 0;
  policy.rungOffsetsDays.forEach((offset, i) => {
    if (offset !== null && days >= offset) rung = i + 1;
  });
  return rung;
}

const effectiveMaxAutoRung = Math.min(
  policy.maxAutoRung,
  buyer.maxRungOverride ?? Infinity,
);
```

`daysBetweenIST` must compute calendar days in `Asia/Kolkata`, not `(t2 - t1) / 86400000`.
A UTC-based calculation shifts every bucket by a day for half the clock and will mis-fire
the 45-day statutory threshold — which is exactly the number a legal notice rests on.

## 5. Promise handling

When Claude classifies an inbound as `PROMISE_TO_PAY` with an extracted date:

```
INSERT promise (promised_date, status=PENDING)
UPDATE invoice SET ladder_paused_until = promised_date + 1 day
-- prior PENDING promises on this invoice → SUPERSEDED
```

On `promised_date + 1`, a `promise-check` job runs:

| Outcome | Action |
|---|---|
| Payment received ≥ promised amount | `promise.status = KEPT`; ladder stops if fully paid |
| Nothing received | `promise.status = BROKEN`; **jump the ladder forward one rung** and send the broken-promise variant of that template |
| Partial received | `promise.status = KEPT`, invoice → `PARTIALLY_PAID`, ladder resumes on the balance |

**Broken promises accelerate escalation.** Three broken promises is a much stronger signal
than 60 days of silence, and it is the single best predictor for the future credit-risk
model (see [doc 12](12-metrics-risks.md)).

Two caps, both exported from `packages/ladder` so they are testable and tunable:

- `MAX_PROMISE_PAUSES_PER_RUNG = 2` — at most two promise-driven pauses per rung. Otherwise
  a buyer keeps promising and the ladder never advances, which is the well-known way for a
  collections system to be gamed into uselessness. The pause budget resets when the ladder
  reaches a new rung.
- `MAX_BROKEN_PROMISE_ACCELERATION = 2` — each broken promise advances the target by one
  rung, capped at two. The cap matters: without it, arithmetic alone could carry an invoice
  to a legal rung. Acceleration still cannot bypass guard 11 — legal rungs need the human.

## 6. Message content: what AI does and does not do

WhatsApp requires pre-approved templates for business-initiated messages, so the shape of
every outbound reminder is fixed. What varies:

| Varies | How |
|---|---|
| Template choice | Engine, from rung + whether a promise was broken. **Tone is not in the template id** — docs/05 §3 names templates `bakaya_r{rung}_{variant}_{lang}`, which is what keeps the catalogue at ~30 rather than ~180. Tone drives rung timing via policy; if it ever needs to drive copy, that is a template-catalogue change, not an engine change |
| Language | `buyer.preferredLanguage ?? org.defaultLanguage` |
| Variables | Invoice number, amount, days overdue, payment link — from the DB |
| Contact addressed | Primary contact; escalate to proprietor at rung 4+ |

The AI does **not** free-write outbound reminders. It classifies inbound messages, replies
inside an open 24-hour service window, and drafts legal letters. That split keeps template
approval manageable and keeps the outbound surface predictable.

## 7. Worked example

₹4,20,000 invoice, due 14 Oct 2026, buyer in Ludhiana, Hindi, standard tone.

```
11 Oct  rung 1 is due — but 11 Oct 2026 is a SUNDAY and the default policy has
        sendOnWeekends: false, so guard 12 defers it. WAIT until Mon 12 Oct 09:00.
12 Oct  rung 1  pre-due courtesy + invoice PDF + payment link
14 Oct  rung 2  due today
        ── buyer: "abhi cash tight hai, 25 ko dekhte hain"
        ── classify → PROMISE_TO_PAY, date 2026-10-25, confidence 0.91
        ── promise created; ladder paused until 26 Oct
21 Oct  (rung 3 would have fired — suppressed by guard 8) ✅
26 Oct  promise-check: nothing received → promise BROKEN
        ── time-based rung on D+12 is 3; one broken promise accelerates +1 → rung 4
        ── broken-promise variant sent
        ── "Aapne 25 Oct ki date di thi. ₹4,20,000 ab 12 din overdue hai."
02 Nov  no reply → rung 5 is legal, so: REQUEST_APPROVAL
        ── appears in that evening's digest: "1 invoice ready for 43B(h) — reply 1"
02 Nov  owner replies "1" → legal_approved_at set
03 Nov  rung 5 fires with the 43B(h) intimation letter attached
09 Nov  payment received ₹4,20,000 → STOP, promise KEPT, ladder closed
```

Note what did **not** happen: no message on 21 Oct. That silence is the product.

This sequence is executable — it is `packages/ladder/test/scenario.test.ts`, replayed day
by day. The Sunday deferral above was found by writing that test, not by reading this doc.

## 8. Test plan for `packages/ladder`

This is a pure function with an enumerable input space. Test it properly:

- **Property tests (fast-check):** a paid invoice never produces `SEND`; an opted-out
  contact never produces `SEND`; rung never exceeds `effectiveMaxAutoRung` without
  `legalApprovedAt`; rung never decreases.
- **Golden-path table tests:** one row per (rung × tone × language × promise-state).
- **The 12 guards:** one test per guard asserting it fires *and* one asserting the guard
  below it is correctly shadowed.
- **DST/timezone:** India has no DST, but the server may run in UTC — assert day
  boundaries at 18:30 UTC (= IST midnight) explicitly.
- **Idempotency:** calling `decide` twice with the same input and clock returns the same
  decision, and the send path dedupes on `(invoice_id, rung, date)`.

Target >95% branch coverage here. Don't chase coverage anywhere else in the codebase.

**As built:** 130 tests, 99.21% branch / 100% function coverage on `src/`, with the 95%
threshold enforced by `vitest.config.ts` so a drop fails the run rather than the review.
Property tests run 3,000 generated inputs each.
