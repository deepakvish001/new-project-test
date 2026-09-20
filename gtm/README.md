# Phase 0 Kit — Validation before code

Everything needed to run the validation gate in
[`docs/10-roadmap.md`](../docs/10-roadmap.md) Phase 0.

**The gate:** sell three ₹2,500 concierge pilots in two weeks. If they don't sell, don't
build. ₹7,500 of signal before ₹32–40 lakh of engineering.

| File | Use |
|---|---|
| [`01-call-script.md`](01-call-script.md) | The 20 discovery calls — 9 questions, in order, in Hinglish. Includes what *not* to say |
| [`02-outreach-list.md`](02-outreach-list.md) | Cluster ranking, associations, government data sources, week-1 day plan |
| [`03-concierge-playbook.md`](03-concierge-playbook.md) | Running the ₹2,500 / 30-day manual pilot, day 0 to day 30 |
| [`04-ca-pitch.md`](04-ca-pitch.md) | CA channel pitch, commission models, objection handling |
| [`05-call-log-template.csv`](05-call-log-template.csv) | 27-column capture sheet — fill one row after every call |

## Order of operations

```
Day 1     Read Ludhiana's District Industrial Profile (dcmsme.gov.in)
          Call the LUB branch office for a meeting slot
          Build a 60-name dial list
Day 2-6   20 discovery calls  (01-call-script.md)  — no pitching
Day 4+    5 CA conversations in parallel  (04-ca-pitch.md)
Week 2    Sell 3 concierge pilots, take payment on the call
Week 3-6  Run the pilots by hand  (03-concierge-playbook.md)
Day 30    Review call → ≥2 of 3 convert to paid → BUILD
```

## Two things people skip, and shouldn't

**Log every call within 5 minutes.** The exact words matter more than the summary — they
become your WhatsApp template copy and your classifier eval set.

**Save every buyer reply verbatim.** Target 150+ labelled examples out of Phase 0. That
corpus is worth more than the ₹7,500 in pilot fees, and you cannot reconstruct it later.
