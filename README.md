# Bakaya — WhatsApp-native AI collections agent for Indian MSMEs

> **Working codename.** बकाया = outstanding dues. Rename before launch if a better trademark clears.

Bakaya chases overdue B2B invoices for Indian MSME manufacturers over WhatsApp, in the
buyer's own language, with a legally-backed escalation ladder — so the owner stops making
awkward payment-reminder phone calls and the money arrives faster.

## The problem

- **₹8.1 lakh crore** of MSME receivables sit unpaid in India (Economic Survey 2025-26).
- A ₹5 Cr-turnover manufacturer typically carries **₹1 Cr stuck**, at a **75-day DSO**.
- The owner personally chases payment. It is time-expensive and relationship-awkward,
  so it gets under-done — and the money slips to 90+ days.
- **Section 43B(h)** of the Income Tax Act gives them a real legal lever (buyer loses the
  tax deduction if an MSME supplier isn't paid within 45 days) that almost nobody uses,
  because nobody wants to send that letter manually.

## What Bakaya does

1. Connects to the customer's **Tally** (or a ledger/GSTR-1 upload) and builds an ageing
   list of outstanding invoices.
2. Runs an **automatic escalation ladder** over WhatsApp — polite reminder → firm notice →
   43B(h) intimation → MSMED Sec-16 interest claim — in Hindi, Gujarati, Marathi, Tamil
   or Punjabi.
3. Attaches the invoice PDF and a **one-tap payment link** to every message.
4. Classifies every buyer reply (*paid / promise-to-pay / dispute / needs documents*) and
   auto-schedules the next touch.
5. Sends the owner a **daily WhatsApp digest** and escalates only what needs a human.
6. Generates the **legal pack** — 43B(h) letter, interest computation, MSME Samadhaan draft.

Escalation past the "firm" rung always requires owner approval. Preserving the buyer
relationship is the product's core promise, not an afterthought.

## Target customer (v1 beachhead)

₹1–50 Cr turnover **B2B manufacturers and suppliers in industrial clusters** — auto
components (Ludhiana, Pune), textiles (Tiruppur, Surat), packaging, printing, chemicals,
electricals. They sell on 30–90 day credit to larger buyers, run on Tally, and do business
on WhatsApp.

## Documentation

| Doc | Contents |
|---|---|
| [01 — Product spec](docs/01-product-spec.md) | Jobs-to-be-done, v1 scope, explicit non-goals |
| [02 — Architecture](docs/02-architecture.md) | Services, data flow, stack decisions |
| [03 — Data model](docs/03-data-model.md) | Entity model and schema rationale |
| [04 — Collections engine](docs/04-collections-engine.md) | The escalation state machine |
| [05 — WhatsApp layer](docs/05-whatsapp-layer.md) | BSP choice, templates, costs, quality rating |
| [06 — Tally integration](docs/06-tally-integration.md) | Connector design + three fallback modes |
| [07 — AI layer](docs/07-ai-layer.md) | Claude usage, prompts, cost per customer |
| [08 — Legal pack](docs/08-legal-pack.md) | 43B(h), MSMED Sec 15/16, Samadhaan |
| [09 — Security & DPDP](docs/09-security-dpdp.md) | Data handling before the May 2027 deadline |
| [10 — Roadmap](docs/10-roadmap.md) | Day 0 → Day 180, with kill criteria |
| [11 — Pricing & GTM](docs/11-pricing-gtm.md) | Unit economics and the CA channel |
| [12 — Metrics & risks](docs/12-metrics-risks.md) | North star, funnel, what can kill this |

Database schema: [`db/schema.sql`](db/schema.sql)

**Phase 0 field kit** — [`gtm/`](gtm/): discovery call script, cluster outreach list,
concierge pilot playbook, CA channel pitch, and the call log template. Start there, not in
`docs/`.

## Status

**Pre-validation.** No code yet, and none should be written until the concierge pilots in
[docs/10-roadmap.md](docs/10-roadmap.md) Phase 0 have sold. That gate is the most important
thing in this repository.
