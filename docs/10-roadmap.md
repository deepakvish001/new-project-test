# 10 — Roadmap

## Phase 0 — Validation (Weeks 1–3) · **write no code**

This is the most important phase in this document. Most Indian SaaS dies because the
founder built first and looked for customers after.

### Week 1 — 20 conversations

Source from IndiaMART supplier listings, cluster associations (Laghu Udyog Bharati, FISME),
and trade-body member directories in Ludhiana, Pune, Tiruppur, Surat, Rajkot.

Ask, in this order, and **do not pitch**:

1. Kitna paisa abhi atka hua hai? Kitne din ka average?
2. Paisa maangne ka kaam kaun karta hai? Hafte mein kitna time?
3. Last time jab ek buyer ne 90 din laga diye — kya kiya aapne?
4. 43B(h) ka pata hai? Kabhi use kiya? Kyun nahi?
5. Kya darr lagta hai zyada takaada karne mein?
6. Abhi is problem par kuch kharch kar rahe ho? Kitna?

Question 6 is the real one. Existing spend — on a collections person, a CA's time, a
factoring discount — is the budget we are competing for.

**Record every call** (with permission). These recordings are your template copy, your
classifier eval set, and your pitch deck.

### Week 2 — sell three concierge pilots

Charge **₹2,500 upfront** for a 30-day manual pilot. For 30 days you personally:

- take their Tally "Bills Receivable" Excel export,
- send follow-ups by hand from a WhatsApp Business app,
- log every reply in a spreadsheet,
- send a daily summary message.

No code. No product. You are the product.

### Week 3 — decide

| Signal | Meaning |
|---|---|
| 3 pilots sold, money received | ✅ Build |
| Interest but nobody pays upfront | 🟡 Wrong customer or wrong price — re-run week 1 with a different cluster |
| Can't get 20 conversations | 🔴 You have no distribution. Fix that before anything else |

**Kill criterion: if you cannot sell three ₹2,500 pilots in two weeks, do not build this.**
Write that down and mean it.

Run 5 CA conversations in parallel: would you recommend this to clients, and at what
commission?

## Phase 1 — Manual-assisted MVP (Weeks 4–9)

Goal: the concierge pilots stop being manual. Same customers, same promise, automated.

| Week | Ships |
|---|---|
| 4 | Postgres + Prisma + RLS. CSV/XLSX upload + column mapping. Buyer dedupe. Ageing view. |
| 5 | `packages/ladder` — the pure state machine, fully tested, before any I/O touches it. |
| 6 | WhatsApp send path via BSP. 6 templates × 2 languages (Hindi, English) submitted for approval. Razorpay payment links. |
| 7 | Inbound webhook + Claude classification + promise tracking. |
| 8 | Owner digest, reply-to-approve, dispute and hostile handoff. |
| 9 | Harden: idempotency, retries, quality-rating monitor, sync staleness pause. |

**Template approval is on the critical path.** Submit in week 6 — Meta review takes days and
rejections need a rewrite-and-resubmit cycle. Do not discover this in week 9.

**Exit criteria:** 3 pilot orgs live, ladder running unattended for 14 days, classifier
accuracy > 85% on a 150-example labelled set, zero messages sent to a paid invoice.

## Phase 2 — Sellable product (Weeks 10–16)

| Week | Ships |
|---|---|
| 10–11 | Tally connector (Windows tray app) + mTLS ingest |
| 12 | Legal pack: 43B(h) letter, s.16 computation, Samadhaan draft — **after** legal review |
| 13 | Gujarati, Marathi, Tamil, Punjabi templates |
| 14 | Read-only dashboard (Next.js) for the accountant |
| 15 | Self-serve signup, Razorpay subscription billing, onboarding flow |
| 16 | CA partner portal: multi-client view, commission tracking |

**Exit criteria:** 10 paying orgs, one org onboarded entirely self-serve with no founder
involvement, first 43B(h) letter sent and a payment recovered because of it.

## Phase 3 — Distribution (Months 5–8)

Product work slows deliberately; distribution becomes the job.

- Sign **25 CA partners**. Target ~200 businesses of reach.
- Cluster-by-cluster: own Ludhiana completely before touching Pune. Density beats spread —
  references travel inside a cluster and not between them.
- Busy and Marg integrations (what the next tranche of prospects actually runs).
- Case study with hard numbers: "DSO 78 → 54 days in 90 days."
- Target: **100 paying orgs, ₹5L MRR.**

## Phase 4 — The second act (Months 9–18)

By now there is a **buyer payment-behaviour graph**: which buyers pay late, how late, which
messages work, who breaks promises.

- **Buyer risk score**, shown to customers: "this buyer pays 40 days late on average."
- **Credit-limit advisory** before the customer ships on credit.
- Then the real business: **license the risk data** to NBFCs, invoice-discounting platforms
  and TReDS participants. India has no good SME-buyer payment-behaviour dataset.

That is a materially bigger business than the SaaS. It requires a separate consented legal
basis ([doc 09](09-security-dpdp.md) §2) — design for it now, build it then.

## Team

| Phase | Team |
|---|---|
| 0 | You. Alone. |
| 1 | You + 1 full-stack engineer |
| 2 | +1 engineer, +1 part-time CA advisor (₹40–60k for legal review) |
| 3 | +1 customer success (Hindi-first, cluster-based), +1 CA channel manager |

## Budget to 100 customers

| Item | Amount |
|---|---|
| Engineering (2 devs × 8 months) | ₹24–32 L |
| Legal review + PI insurance | ₹1.0 L |
| Infra + WhatsApp + Claude (to 100 orgs) | ₹2.5 L |
| GTM: travel to clusters, CA events | ₹4 L |
| **Total** | **₹32–40 L** |

At 100 orgs × ₹6,000 avg = ₹6L MRR = ₹72L ARR. Bootstrappable if Phase 0 is honest; a
₹2–3 Cr seed is raisable on Phase 2 exit criteria plus CA-channel evidence.
