# 12 — Metrics & Risks

## 1. North star

**Rupees collected per org per month, attributable to Bakaya.**

Not messages sent, not invoices tracked, not MAU. If this number is real, everything else
follows; if it isn't, nothing else matters.

**Attribution rule:** a payment counts as attributed if it lands within **7 days** of a
Bakaya touch on that invoice, or arrives through our payment link. Imperfect, but
consistent — and honest enough to survive a customer challenging it, which they will.

## 2. The metrics that actually predict retention

| Metric | Target | Why |
|---|---|---|
| **DSO reduction** (90-day cohort) | ≥ 10 days | The promise. If this fails, nothing else saves us |
| **Time to first attributed collection** | < 7 days | The activation moment. The best churn predictor we have |
| **Owner phone-calls-avoided** (self-reported, monthly) | ↑ | Job #2 from [doc 01](01-product-spec.md). Quantitatively soft, qualitatively decisive |
| **Reply rate to rung 1–3** | > 35% | Below this, templates or language register are wrong |
| **Promise-kept rate** | > 55% | Below this, the ladder is too soft |
| **Classification accuracy** | > 90% | On the labelled eval set |
| **Buyer complaints per 1,000 messages** | < 2 | The relationship-damage canary |
| **WhatsApp quality rating** | Green | Existential — see risks |

## 3. Funnel

```
Cluster conversation      →  Concierge/trial      →  Paid      →  Activated  →  Retained
        30                        10                   4            3             2.5
                               (33%)                 (40%)        (75%)        (83% M3)
```

Targets: **≥ 40% trial→paid**, **≥ 75% paid→activated**, **≤ 4% monthly logo churn**.

Trial→paid below 40% means the wrong customer, not a weak product. Go back to Phase 0.

## 4. Instrument from day one

Do not defer this. Rebuilding attribution retroactively is impossible.

- `message_log.cost_paise` on every send → real COGS per org, not a spreadsheet guess
- Every `ladder_event` with its reason → why did this invoice escalate?
- Claude `usage` (input/output/cache-read tokens) per classification
- `sync_run` success rate and staleness distribution per org
- Time from inbound received → classified → acted on

## 5. Risks, honestly

### 🔴 Existential

**WhatsApp number quality collapse.** A dunning product generates blocks and reports. Red
rating kills the channel. *Mitigations:* one sender number per org (blast radius of one),
instant opt-out, quiet hours, ≤200 sends/number/day, auto-pause on Yellow, never dun a
disputed invoice. **Monitor this daily from day one** and treat a Yellow as a Sev-1.
See [doc 05](05-whatsapp-layer.md) §4.

**Relationship damage ends a pilot.** One customer losing a buyer because of us ends that
account and poisons the cluster. *Mitigations:* the approval gate on rungs 5–6, hostile
handoff, per-buyer escalation ceilings, conservative default tone. Ask every pilot customer
directly, monthly: *"kisi buyer ne kuch kaha?"*

**A big player ships this as a feature.** Zoho, Razorpay or Vyapar could. *Mitigations:*
speed, the CA channel lock-in, and the legal pack (which needs legal review and liability
appetite they may not want). Ultimately the data moat is the only durable answer.

### 🟡 Serious

**Tally connector friction.** The customer's IT person, or the owner's own instinct, blocks
the install. *Mitigation:* CSV mode is the default path, not a fallback. The connector is an
upgrade we offer after they already see value.

**Stale sync → dunning a paid invoice.** The single most damaging bug we can ship.
*Mitigation:* auto-pause the ladder at 48h sync staleness, surface staleness in the digest.
Silence is always safer than a wrong message.

**The owner never opens the digest.** Approvals stall, escalations never fire, value plateaus.
*Mitigation:* reply-to-approve in WhatsApp (`reply 1`), never "log in to approve". If the
digest reply rate is low, that is a product failure, not a user failure.

**Template rejection or miscategorisation as marketing.** COGS jumps 7.5×. *Mitigation:*
strictly transactional copy, native-speaker review, submit early (week 6).

### 🟢 Manageable

**Classification errors.** Confidence gate + human review queue + weekly labelled sampling.

**Legal exposure on rungs 5–6.** Human approval, customer letterhead, PI insurance,
frozen computations. See [doc 08](08-legal-pack.md) §6.

**CA channel doesn't convert.** Direct cluster GTM is the parallel path; run both from
Phase 3, do not bet the company on one.

## 6. The failure mode to watch for

The most likely way this dies is not a technical failure. It is:

> The product works, DSO drops, the customer is happy — **and the owner still makes the
> phone calls anyway**, out of habit and anxiety.

Then the perceived value is a reporting tool, retention decays at renewal, and the metrics
looked fine the whole time.

Watch for it by asking, in every monthly check-in: *"Is hafte kitne buyers ko khud phone
kiya?"* If the answer isn't trending to zero, the product has not actually won the job it
was hired for — and no dashboard will tell you that.

## 7. Review cadence

| Cadence | What |
|---|---|
| Daily | WhatsApp quality rating, sync failures, send errors |
| Weekly | Classification eval on 100 fresh samples; collections per org |
| Monthly | Cohort DSO, churn, COGS per org, CA channel pipeline |
| Quarterly | Repricing, roadmap against the Phase gates in [doc 10](10-roadmap.md) |
