# 08 — Legal Pack

Rungs 5 and 6 are what differentiate this from a reminder bot. They are also where we can
do real damage if we are sloppy, so the rules are conservative by design.

> **This doc is engineering guidance, not legal advice.** Have a practising CA and a
> commercial lawyer review every template and the interest computation before the first
> letter goes out. Budget ₹40–60k for this. It is not optional.

## 1. The two statutory levers

### 1.1 Section 43B(h), Income Tax Act — the pressure

Inserted by the Finance Act 2023, effective 1 April 2024. If a buyer does not pay a
**micro or small enterprise** supplier within the MSMED time limit, that expense is
**disallowed as a deduction** in the year of accrual, and is instead taxed as income.

Why this is the strongest lever in Indian B2B collections: it converts a late payment from
the buyer's *cash-flow convenience* into the buyer's *tax problem*. A ₹4 lakh overdue
invoice can cost the buyer more in disallowed deduction than paying it would.

A rung-5 letter does not threaten. It **informs** — it tells the buyer's accounts team what
their own auditor will flag at year end. In practice that is enough, because the person who
reads it forwards it to someone who cares.

### 1.2 MSMED Act s.15–16 — the interest

- **s.15**: buyer must pay within the agreed period, capped at **45 days** from acceptance.
- **s.16**: on default, compound interest with monthly rests at **three times the RBI bank
  rate**, from the appointed day.
- That interest is itself **not deductible** for the buyer under the Income Tax Act.

### 1.3 MSME Samadhaan — the escalation

The government portal (`samadhaan.msme.gov.in`) for filing delayed-payment references to
the MSEFC. We generate a **pre-filled draft**. The customer files it. We never file.

## 2. Eligibility gate — check before enabling rungs 5–6

The engine must refuse legal escalation unless **all** of these hold:

```
✓ org.udyam_number is present and validated
✓ the org is classified Micro or Small (NOT Medium — 43B(h) does not cover Medium)
✓ the buyer is a registered entity (GSTIN present)
✓ days overdue > the applicable limit (45 days, or the written agreement's term if shorter)
✓ no open dispute on the invoice
✓ owner has approved THIS invoice explicitly
```

The Medium-enterprise carve-out catches people out constantly. If an org is Medium,
**disable rungs 5–6 entirely in the UI** and say why — do not let them send a letter
asserting a protection they do not have. That is worse than sending nothing.

## 3. Interest computation — code, never the model

```typescript
// packages/legal/src/interest.ts
// MSMED s.16: compound interest, monthly rests, at 3× the RBI bank rate.
export function computeMsmedInterest(args: {
  principalPaise: bigint;
  appointedDay: Date;          // day after the 45-day (or agreed) period expires
  asOf: Date;
  rbiBankRatePct: number;      // from a versioned table, NOT hardcoded
}): { interestPaise: bigint; months: number; ratePct: number; schedule: Rest[] };
```

Non-negotiables:

1. **`BigInt` paise throughout.** Never float. A rounding error on a legal document is
   indefensible.
2. **The RBI bank rate is versioned data** with effective-from dates, in a table, with a
   migration when it changes. If a rate change is missed, every letter after it is wrong.
3. **Freeze the inputs.** `legal_document.computation` stores the rate, the appointed day,
   the day count and the resulting figure, so the PDF can be re-derived years later.
4. **Round half-up to the rupee, once, at the end.**
5. **Property-test it:** interest is monotonic in time, zero at the appointed day, and
   matches a hand-worked reference table for a set of known cases.

## 4. Document generation

Three documents, rendered as HTML → PDF (Puppeteer) on the org's letterhead:

| Kind | Rung | Contents |
|---|---|---|
| `SEC_43BH_INTIMATION` | 5 | Invoice particulars, Udyam number, days overdue, plain statement of the buyer's 43B(h) exposure, payment link. **Informational tone.** |
| `MSMED_INTEREST_CLAIM` | 6 | The above + the s.16 computation table + formal demand |
| `SAMADHAAN_DRAFT` | post-6 | Pre-filled MSEFC reference for the customer to file themselves |

Bilingual: English body (it will be read by an accounts department and possibly an auditor)
with a regional-language summary at the top (it will first be read by whoever opens the
WhatsApp).

## 5. Hard rules

1. **Never send a legal document without a logged human approval.** `legal_document`
   requires a non-null `approved_by`. Enforce it with a `NOT NULL` constraint, not a code
   path — code paths get refactored.
2. **Never state a fact we cannot evidence.** Every claim in the letter traces to a row:
   the invoice, the ledger, `message_log` (proof of communication), the computation.
3. **Never use the word "legal action" at rung 5.** Rung 5 informs about a tax consequence.
   Rung 6 makes a statutory interest claim. Neither threatens litigation, because we are not
   the customer's lawyer and cannot commit them to it.
4. **Never auto-file anything** on a government portal. We draft; a human files.
5. **Always offer a resolution path** in the same document — the payment link, and a line
   inviting them to raise a dispute if the amount is wrong.
6. **Attach the evidence.** A 43B(h) letter with the invoice copy, the ledger extract and
   the reminder history attached is dramatically more effective than the letter alone, and
   it costs us nothing to generate.

## 6. Our liability posture

- We are a **tool**, not a legal service. The letters issue **from our customer**, on their
  letterhead, under their name, with their explicit approval. Our name is not on them.
- Terms of service must say this in plain words, and the approval screen must restate it at
  the moment of approval — not buried at signup.
- **Professional indemnity insurance** before the first legal letter ships. Cheap in India
  (~₹25–50k/year at this scale) relative to the exposure.
- Keep an auditable trail of who approved what, when, and what facts were true at that
  moment. That is what `legal_document.computation` plus the append-only logs are for.

## 7. What this unlocks commercially

Most of our competitors are reminder tools. The legal pack is the reason a customer pays
₹5,999 instead of ₹999, and it is the reason a CA recommends us — a CA understands 43B(h)
and has been telling clients to use it for two years without a practical way to do so.

Build rungs 1–4 first and sell on collections. But rungs 5–6 are the moat, so do not defer
them past v1: they are also the hardest to copy, because they need the legal review, the
rate table and the liability posture that a generic WhatsApp automation vendor will not do.
