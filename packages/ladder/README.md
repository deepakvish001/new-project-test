# @bakaya/ladder

The escalation state machine. **Pure — no I/O, no clock access, no randomness.**

This is the part of the system that must be right, so it is the part with no dependencies
to hide behind. Everything it needs is passed in; everything it decides comes back as a
value. Spec: [`docs/04-collections-engine.md`](../../docs/04-collections-engine.md).

```ts
import { decide } from "@bakaya/ladder";

const decision = decide(input, new Date());

switch (decision.action) {
  case "SEND":             // decision.rung, .template, .variant, .language
  case "WAIT":             // decision.until  -> invoice.next_action_at
  case "REQUEST_APPROVAL": // decision.rung   -> tonight's owner digest
  case "HANDOFF_TO_OWNER": // decision.urgency
  case "STOP":             // ladder closed
}
```

`decision.reason` is a stable machine-readable code (`promise_pending`, `buyer_hostile`,
`due_date_passed`, …) written straight to `ladder_event.reason`. It is queryable, so don't
reword the codes casually.

## Why dates are strings

Business dates (`dueDate`, `promisedDate`) are `IstDate` — a branded `'YYYY-MM-DD'`, not a
`Date`. A `Date` carries an instant, and `(t2 - t1) / 86400000` on instants silently shifts
every ageing bucket by a day for half the clock. That would mis-fire the 45-day statutory
threshold a legal notice rests on. `istDate("2026-02-30")` throws rather than rolling over
to 1 March.

`now` is a real `Date`, because it is a real instant. IST is a fixed UTC+05:30 — India has
not observed DST since 1945 — so the offset arithmetic in `ist.ts` is exact and needs no
timezone library.

## Guard order is the design

Thirteen guards, first match wins. The ordering encodes the priorities, not just the logic:
an opt-out outranks everything commercial; hostility outranks a dispute because it needs the
owner today; a recorded promise-to-pay outranks the next rung, because chasing a buyer who
already gave a date is how the customer loses face and churns.

Changing the order changes the product. The shadowing tests in `test/guards.test.ts` exist
to make that change fail loudly.

## Tests

```bash
npm test --workspace=@bakaya/ladder           # 130 tests
npm run coverage --workspace=@bakaya/ladder   # thresholds enforced at 95%
npm run typecheck --workspace=@bakaya/ladder
```

| File | Covers |
|---|---|
| `test/ist.test.ts` | Date arithmetic, the 18:30-UTC day boundary, leap days, quiet windows that wrap midnight |
| `test/guards.test.ts` | Each guard fires — **and shadows the one below it** |
| `test/rungs.test.ts` | The offset table, disabled rungs, broken-promise acceleration, exhaustion |
| `test/promises.test.ts` | Promise suppression, the per-rung pause cap, variant selection |
| `test/properties.test.ts` | 3,000 generated inputs per invariant (fast-check) |
| `test/scenario.test.ts` | The worked example from docs/04 §7, replayed day by day |

The property tests are the ones that matter most. They assert the things that must hold for
*every* input: never send on a settled invoice, never send to an opted-out contact, never
send a legal rung without approval, never send outside the send window, never move the
ladder backwards, and never mutate the input.

## Two things found by writing this

- **Guard 10 (`rung_already_sent`) was missing from the spec.** Without it, an invoice at a
  legal rung re-requests approval on every tick. The send layer's idempotency key would have
  swallowed the duplicate send silently, so it would never have surfaced as a visible bug —
  just a digest full of repeat approval requests.
- **The doc's worked example sent rung 1 on a Sunday.** The default policy has
  `sendOnWeekends: false`, so the real behaviour is a deferral to Monday 09:00. Both are
  now corrected in docs/04.
