# 01 — Product Spec

## 1. The customer

**Who:** Owner or finance head of a ₹1–50 Cr turnover B2B manufacturer/supplier in an
Indian industrial cluster.

**Firmographics we filter on:**

| Attribute | Value |
|---|---|
| Turnover | ₹1–50 Cr |
| Sales model | B2B, credit terms 30–90 days |
| Buyers | 20–300 recurring, mostly larger than them |
| Accounting | Tally Prime (≈80%), Busy/Marg/Vyapar (≈15%), Excel (≈5%) |
| Receivables stuck | 20–40% of annual turnover at any moment |
| Who chases payment | The owner, or one accounts person part-time |
| MSME registered (Udyam) | Yes — required for the 43B(h) lever to apply |

**Why they are the right beachhead:** they have the money problem, they have budget, they
are reachable through CAs and cluster associations, and their data already sits in one
place (Tally) in a structured form.

## 2. Jobs to be done

Ranked by how much the customer actually cares:

1. **"Get my stuck money in, faster."** DSO down. This is the only job that gets us paid.
2. **"Stop making me do the awkward chasing."** The owner hates calling a buyer to ask for
   money. Removing that emotional cost is a bigger driver than the time saved.
3. **"Don't let me lose the buyer."** Fear of over-chasing is the #1 reason MSMEs
   under-collect. Our tone control and approval gate directly address this.
4. **"Tell me who is actually going to pay."** Owners have no ranked view of their
   receivables risk.
5. **"Give me a legal escalation I can actually use."** 43B(h) exists; nobody uses it
   because drafting it is work and sending it feels nuclear.

## 3. Core product loop

```
Tally sync  →  ageing buckets  →  escalation ladder over WhatsApp
                                          ↓
                            buyer reply → AI classification
                                          ↓
              promise-to-pay / dispute / paid / docs-needed
                                          ↓
            reschedule next touch  ·  or  ·  escalate to owner
                                          ↓
                        daily WhatsApp digest to the owner
```

Every loop iteration produces one of three outcomes: **money moved**, **a dated promise
recorded**, or **a human decision requested**. Nothing else is a valid terminal state.

## 4. v1 scope — the six things that ship

### 4.1 Connect
- Tally Prime sync via the local XML/HTTP connector (see [doc 06](06-tally-integration.md)).
- Fallbacks: CSV/XLSX ledger upload, and GSTR-1 JSON import.
- Output: normalised invoice list with ageing buckets (0-30 / 31-45 / 46-60 / 61-90 / 90+).

### 4.2 Escalation ladder
Pre-approved WhatsApp **utility** templates fired on a schedule keyed to each invoice's due
date. Six rungs, full detail in [doc 04](04-collections-engine.md). Rungs 5 and 6 (legal)
require explicit owner approval per invoice.

### 4.3 Payment rail
Every outbound message carries the invoice PDF and a Razorpay/Cashfree payment link scoped
to that invoice. Webhook on payment → invoice auto-marked settled → ladder stops.

### 4.4 Reply handling
One unified inbox. Claude classifies every inbound message into a fixed enum and extracts
structured fields (promised date, disputed amount, requested document). Confident
classifications auto-act; low-confidence ones queue for the owner.

### 4.5 Owner digest
One WhatsApp message per day, ~19:00 IST:
> *Aaj: ₹4.2L collected · ₹11.8L promised this week · 3 disputes need you · 2 invoices
> ready for 43B(h) — reply 1 to approve*

Reply-to-act. The owner should never need to open a dashboard to run the system.

### 4.6 Legal pack
On approval, generates: 43B(h) intimation letter, MSMED Sec-16 compound-interest
computation, and a pre-filled MSME Samadhaan application draft. PDF, on letterhead,
in English + the buyer's regional language.

## 5. Explicit non-goals for v1

Writing these down is what keeps v1 shippable in 10 weeks.

| Not building | Why | Revisit |
|---|---|---|
| Full accounting / invoicing | Tally owns this. We are a layer, never the system of record. | Never |
| Accounts **payable** | Different buyer, different pitch. | v3 |
| Voice calling agent | Per-minute costs and consent rules blow up the unit economics at ₹2.5–6k/mo. | v2, measured |
| Invoice discounting / lending | Needs an NBFC partner and a balance sheet. This is the *second act*, not v1. | v3+ |
| A web dashboard as primary UI | Owners live in WhatsApp. Dashboard is read-only reporting for the accountant. | v1.5 |
| Multi-currency / exports | Beachhead is domestic B2B. | v2 |
| Automatic legal filing | We draft; a human files. Liability. | Never automate fully |
| Buyer-side portal | Adds a login our buyers won't use. Payment link is enough. | v2 |

## 6. Two hard product rules

**Rule 1 — The owner owns escalation.** Rungs 1–4 run automatically. Rungs 5–6 (legal)
never fire without a per-invoice human approval. This is a product promise we market on,
and it is also our liability firewall.

**Rule 2 — Templates over improvisation.** WhatsApp requires pre-approved templates for
business-initiated messages. The AI selects, personalises and translates *within* approved
templates; it does not free-write outbound reminders. Free-form AI text is allowed only
inside an open 24-hour service window, and even there it is tone-constrained.

## 7. Success definition for v1

A pilot customer is a success if, after 60 days:

- DSO down **≥ 10 days**, or
- **≥ 15%** of their 90+ day bucket collected, and
- the owner made **zero** payment-chasing phone calls in the last two weeks, and
- **zero** buyer relationships damaged (we ask them directly).

If we hit the DSO number but the owner still makes the calls, we have not solved job #2 —
and retention will fail even though the metric passed.
