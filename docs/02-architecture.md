# 02 — Architecture

## 1. Stack decisions

| Layer | Choice | Why |
|---|---|---|
| Language | **TypeScript (Node 22 LTS)** | One language across API, workers and dashboard. Largest hiring pool in India at this price point. |
| API | **Fastify** | Fast, first-class schema validation, lighter than Nest for a team of 2–3. |
| DB | **PostgreSQL 16** | Relational, and we need real transactions around money state. Managed: Neon or RDS ap-south-1. |
| ORM | **Prisma** | Migrations and type safety matter more here than raw query control. |
| Queue | **BullMQ on Redis** | Scheduled jobs are the heart of this product. Delayed jobs, retries, rate limiting built in. |
| AI | **Claude (`claude-opus-5`)** via `@anthropic-ai/sdk` | See [doc 07](07-ai-layer.md). |
| WhatsApp | **Meta Cloud API**, wrapped behind our own port | See [doc 05](05-whatsapp-layer.md). |
| Payments | **Razorpay** (Cashfree as second rail) | Payment links API, widest MSME familiarity. |
| Files | **S3 ap-south-1** (invoice PDFs, legal letters) | Data residency. See [doc 09](09-security-dpdp.md). |
| Dashboard | **Next.js + Tailwind** | Read-mostly. Ships after the WhatsApp loop works. |
| Hosting | **ap-south-1 (Mumbai), single region** | DPDP posture + latency. No multi-region until it's a real problem. |

**Non-negotiable:** every piece of customer data stays in `ap-south-1`. The only egress is
to the Claude API and to Meta. Both are documented in the DPDP record of processing.

## 2. Services

Three deployables. Resist making it more.

```
┌───────────────────────────────────────────────────────────────────┐
│  api        Fastify HTTP                                          │
│             · WhatsApp webhook receiver (Meta → us)               │
│             · Razorpay payment webhook                            │
│             · Tally connector ingest endpoint (mTLS)              │
│             · Dashboard REST/tRPC for the Next.js app             │
│             Does NO long work — it validates, persists, enqueues. │
└───────────────────────────────────────────────────────────────────┘
┌───────────────────────────────────────────────────────────────────┐
│  worker     BullMQ consumers                                      │
│             · ladder-tick      decide + send the next touch       │
│             · inbound-classify run Claude over a buyer reply      │
│             · tally-reconcile  diff a sync into invoice state     │
│             · digest-send      daily owner summary                │
│             · legal-generate   render the 43B(h) / Sec-16 pack    │
└───────────────────────────────────────────────────────────────────┘
┌───────────────────────────────────────────────────────────────────┐
│  scheduler  One tiny cron process                                 │
│             · 06:00 IST  enqueue tally-sync for all orgs          │
│             · 10:00 IST  enqueue ladder-tick for due invoices     │
│             · 19:00 IST  enqueue digest-send                      │
│             Enqueues only. Never does work itself.                │
└───────────────────────────────────────────────────────────────────┘
```

Plus one thing that runs on the **customer's** machine:

```
┌───────────────────────────────────────────────────────────────────┐
│  tally-connector   Windows tray app (Node + pkg)                  │
│                    Talks XML to Tally on localhost:9000,          │
│                    pushes outbound-only over HTTPS to api.        │
│                    Never accepts an inbound connection.           │
└───────────────────────────────────────────────────────────────────┘
```

## 3. The two critical data flows

### 3.1 Outbound — the ladder tick

```
scheduler (10:00 IST)
   └─> enqueue ladder-tick per org
         └─> worker: load invoices where next_action_at <= now
               ├─ evaluate rung  (04-collections-engine.md, pure function)
               ├─ rung >= 5 and not owner-approved? → park, add to digest, STOP
               ├─ select approved template + language + variables
               ├─ mint Razorpay payment link (idempotent, keyed on invoice_id)
               ├─ send via WhatsApp port
               ├─ INSERT message_log  (one row per send attempt)
               └─ UPDATE invoice.next_action_at, invoice.current_rung
```

Everything after "evaluate rung" is wrapped so that a WhatsApp failure rolls back
`next_action_at` — we must never silently skip a rung.

### 3.2 Inbound — a buyer replies

```
Meta webhook → api
   ├─ verify X-Hub-Signature-256              (reject on mismatch)
   ├─ INSERT inbound_message (raw, immutable) (idempotent on wa_message_id)
   ├─ 200 OK within 5s — Meta retries aggressively
   └─ enqueue inbound-classify
         └─> worker
               ├─ resolve buyer + open invoices by wa phone number
               ├─ Claude classify → { intent, confidence, extracted fields }
               ├─ confidence >= 0.85 and intent is auto-actionable?
               │     ├─ PROMISE_TO_PAY  → create promise, set next_action_at = date+1
               │     ├─ ALREADY_PAID    → flag for reconcile, pause ladder 3 days
               │     ├─ NEEDS_DOCUMENT  → auto-send invoice/ledger copy
               │     └─ WRONG_NUMBER    → deactivate contact, alert owner
               └─ else → queue for owner in tomorrow's digest
```

**Idempotency everywhere.** Meta redelivers webhooks. Razorpay redelivers webhooks. Every
handler is keyed on the provider's own event ID and is safe to run twice.

## 4. Why a state machine, not a cron of reminders

The naive build is "send a reminder every 7 days." It fails in three predictable ways:

1. A buyer who replied "paying on the 20th" still gets chased on the 15th → the owner looks
   incompetent and kills the product.
2. A disputed invoice keeps getting dunned → relationship damage, which is the one thing we
   promised wouldn't happen.
3. A partially-paid invoice gets chased for the full amount.

So invoice state is explicit and persisted, transitions are a pure function of
`(invoice, promises, disputes, payments, org_policy)`, and every transition is logged.
See [doc 04](04-collections-engine.md).

## 5. Multi-tenancy

Single database, `org_id` on every table, **PostgreSQL row-level security** enabled with
the app connecting as a non-superuser role that sets `app.current_org_id` per transaction.

Application-level `WHERE org_id = ?` filtering alone is one forgotten clause away from
leaking one manufacturer's buyer list to a competitor in the same cluster. In this market
that is an existential bug, not a Sev-2. RLS is the backstop.

## 6. Repository layout

```
apps/
  api/                 Fastify service
  worker/              BullMQ consumers
  scheduler/           cron enqueuer
  dashboard/           Next.js (v1.5)
  tally-connector/     Windows tray app
packages/
  db/                  Prisma schema + migrations + RLS policies
  ladder/              escalation state machine (PURE, no I/O, heavily tested)
  whatsapp/            Meta Cloud API client + template registry
  ai/                  Claude prompts, schemas, classification
  legal/               43B(h) / Sec-16 / Samadhaan document generation
  shared/              types, money (integer paise), IST date helpers
```

`packages/ladder` having zero I/O is deliberate: it is the part that must be right, and a
pure function is the part you can exhaustively test. Aim for >95% branch coverage there and
don't bother chasing coverage anywhere else.

## 7. Conventions that prevent money bugs

- **Money is `BIGINT` paise.** Never a float, never a JS `number` beyond ₹90,00,00,00,000.
  Use `bigint` in TS and format only at the edge.
- **All business dates are IST.** Store `timestamptz`, compute ageing and due dates in
  `Asia/Kolkata`. A UTC-midnight bug shifts every ageing bucket by a day and silently
  mis-fires the 45-day legal threshold.
- **Append-only logs.** `message_log`, `inbound_message` and `ladder_event` are never
  updated or deleted. They are the evidence trail behind a legal notice.
- **Every outbound send is idempotency-keyed** on `(invoice_id, rung, attempt_date)`.
