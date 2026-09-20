# 03 — Data Model

Full DDL: [`db/schema.sql`](../db/schema.sql). This doc explains the *why*.

## 1. Entity map

```
org ──┬── user                    (owner, accountant)
      ├── org_policy              (tone, ladder timing, auto-escalate limits)
      ├── buyer ──┬── buyer_contact   (multiple people per buyer firm)
      │           └── invoice ──┬── ladder_event    (append-only)
      │                         ├── message_log     (append-only, outbound)
      │                         ├── promise         (dated commitment)
      │                         ├── dispute
      │                         ├── payment
      │                         └── legal_document
      ├── inbound_message         (append-only, raw)
      ├── sync_run                (each Tally/upload ingest)
      └── digest                  (daily owner summary sent)
```

## 2. Design decisions worth defending

### 2.1 `invoice` is a projection, not the source of truth

Tally remains the system of record. Our `invoice` row carries `external_ref` +
`source_system` + `source_hash`, and a reconcile job diffs each sync against it.

Consequence: **a Tally-side edit must win.** If the customer changes an invoice amount in
Tally, our next sync overwrites ours. The only fields we own are collections state
(`current_rung`, `next_action_at`, `status`) — those are never touched by a sync.

### 2.2 `buyer` is deduplicated on GSTIN, not on name

Tally ledgers are a mess: "Sharma Traders", "SHARMA TRADERS PVT LTD" and "Sharma Trdrs" are
three ledgers for one firm. We dedupe on GSTIN where present, then on a normalised name +
phone fallback, and keep `buyer_alias` rows mapping every Tally ledger name we've seen.

Without this, one buyer receives three parallel dunning ladders. That is the fastest way to
lose a customer's trust in week one.

### 2.3 Money is `BIGINT` paise

`amount_paise BIGINT NOT NULL`. Never `NUMERIC` (ORM round-trips it to float in JS), never
`FLOAT`. `₹1,23,456.78` → `12345678`.

### 2.4 Promises are first-class rows, not a nullable column on invoice

A buyer can promise, miss, and re-promise. We need the *history* — three broken promises is
a stronger 43B(h) escalation signal than 60 days of silence, and it is the single best
feature for the future credit-risk model.

### 2.5 Append-only evidence tables

`message_log`, `inbound_message`, `ladder_event` have **no** `UPDATE`/`DELETE` grant for the
app role. When a customer sends a legal notice, this is the evidence chain behind it. It
also makes the whole system replayable for debugging a mis-fire.

### 2.6 `org_policy` exists because tone is per-customer

One manufacturer wants firm dunning from day 3; another sells to a single dominant OEM and
wants to never escalate past rung 3 for that buyer. Escalation timing, tone, per-buyer
overrides and the auto-escalate ceiling all live in policy, not in code.

## 3. Key enums

```
invoice.status        OPEN · PARTIALLY_PAID · PAID · DISPUTED · WRITTEN_OFF · ON_HOLD
invoice.current_rung  0..6                (see doc 04)
promise.status        PENDING · KEPT · BROKEN · SUPERSEDED
dispute.status        OPEN · RESOLVED · ESCALATED
message_log.status    QUEUED · SENT · DELIVERED · READ · FAILED
inbound.intent        PROMISE_TO_PAY · ALREADY_PAID · DISPUTE · NEEDS_DOCUMENT ·
                      PARTIAL_PAYMENT · WRONG_NUMBER · HOSTILE · UNCLEAR · OTHER
legal_document.kind   SEC_43BH_INTIMATION · MSMED_INTEREST_CLAIM · SAMADHAAN_DRAFT ·
                      LEDGER_CONFIRMATION
```

`HOSTILE` is a real and necessary class. When a buyer gets angry, the correct action is to
**stop the ladder immediately** and hand it to the owner — never to send rung 4 on schedule.

## 4. Indexes that matter

```sql
-- the ladder tick's hot query; without this it degrades at ~50k open invoices
CREATE INDEX idx_invoice_next_action
  ON invoice (org_id, next_action_at)
  WHERE status IN ('OPEN','PARTIALLY_PAID');

-- inbound webhook resolution: phone → buyer, must be fast, runs on every reply
CREATE INDEX idx_contact_phone ON buyer_contact (whatsapp_e164);

-- ageing report / digest
CREATE INDEX idx_invoice_due ON invoice (org_id, due_date) WHERE status != 'PAID';

-- webhook idempotency
CREATE UNIQUE INDEX idx_inbound_wa_id ON inbound_message (wa_message_id);
```

## 5. Row-level security

Every tenant table carries `org_id UUID NOT NULL`. The app connects as `bakaya_app`
(non-superuser, `NOBYPASSRLS`) and sets the tenant per transaction:

```sql
SET LOCAL app.current_org_id = '<uuid>';
```

Policies are `USING (org_id = current_setting('app.current_org_id')::uuid)`. See the bottom
of [`db/schema.sql`](../db/schema.sql).

**Test this like a security control, not a feature:** a test that opens a transaction as
org A and asserts zero rows visible from org B should run in CI on every commit.

## 6. Retention

DPDP-driven, detail in [doc 09](09-security-dpdp.md):

| Data | Retention |
|---|---|
| Invoice + payment records | 8 years (Companies Act / GST audit trail) |
| `message_log`, `inbound_message` | 3 years (evidence for interest claims) |
| Buyer contact personal data | Purge 12 months after the org's last open invoice with that buyer closes |
| AI classification inputs/outputs | 90 days, then delete raw text, keep the label |
| Org deleted | Hard-delete within 30 days, except records under statutory retention |
