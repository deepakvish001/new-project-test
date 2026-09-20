# 03 — Concierge Pilot Playbook (₹2,500 / 30 days)

You are the product for 30 days. No code. This phase produces three things at once: paying
customers, real message copy, and the classifier eval set.

## 1. The offer — say it exactly like this

> **₹2,500. 30 din. Main aapka follow-up khud karunga.**
>
> Aap mujhe Tally se "Bills Receivable" ka Excel dete ho — bas.
>
> Main har buyer ko aapke naam se WhatsApp par follow-up bhejunga, reply handle karunga,
> aur roz shaam aapko ek summary bhejunga: kitna aaya, kisne kya bola, kisko aapko khud
> phone karna chahiye.
>
> 30 din baad agar paisa nahi aaya, **₹2,500 wapas.**

The refund promise costs almost nothing — if the pilot fails you should not keep the money
anyway — and it removes the only real objection.

**Take payment on the call.** UPI, right then. "Bhej doonga" means no.

## 2. Setup — Day 0 (60 minutes with the customer)

| Step | Time | Output |
|---|---|---|
| Get the Tally export | 10 min | Walk them through it on the phone: Gateway → Display → Statements of Accounts → Outstandings → Receivables → Export to Excel |
| Clean the buyer list | 20 min | Dedupe ledger names by hand. Confirm ambiguous merges with the owner |
| Get contacts | 10 min | Buyer-wise WhatsApp numbers. Most are already in the owner's phone |
| Agree the tone | 10 min | Read them three draft messages. Ask: *"ye bhejna theek rahega?"* Their edits are your template copy |
| Set the boundary | 10 min | **"Kaunse buyer ko bilkul nahi chhedna?"** Write those names down and respect them absolutely |

That last question is the most important one in the whole pilot. One message to a
protected buyer ends the relationship and the account.

### Your tools
- **WhatsApp Business app** (not the API) on a phone with the owner's business number, or
  a number the owner has told their buyers about
- **One Google Sheet per customer** — the manual version of the database
- **Calendar reminders** for the ladder days

### The sheet
```
Invoice No | Buyer | Contact | Amount | Due Date | Days Overdue | Rung | Last Sent
| Reply (verbatim) | My Classification | Promise Date | Status | Notes
```

**`Reply (verbatim)`** is the single most valuable column in Phase 0. Copy the buyer's exact
words — Hinglish, typos, voice-note transcripts, all of it. This becomes your labelled
eval set. Do not clean it up.

## 3. Run the ladder by hand

Same six rungs as [`docs/04-collections-engine.md`](../docs/04-collections-engine.md), sent
manually. Use the real templates — you are testing the copy, not improvising.

| Rung | Day | Send |
|---|---|---|
| 1 | D−3 | Pre-due courtesy + invoice photo |
| 2 | D+0 | Due today |
| 3 | D+7 | Polite, asks for a date |
| 4 | D+15 | Firm, names amount + days overdue |
| 5 | D+30 | 43B(h) intimation — **only with the owner's explicit yes, per invoice** |
| 6 | D+45 | MSMED interest claim — same gate |

**Batch it.** 30 minutes every morning at 10:00, 15 minutes at 18:00 for replies. Across
three customers with ~100 live invoices that is genuinely manageable.

### Rules you must follow yourself
- Honour the protected-buyer list. No exceptions.
- No messages before 9:00 or after 21:00 IST.
- Someone gets angry → **stop immediately**, tell the owner the same day.
- Someone says they already paid → stop, verify with the owner, never argue.
- Never negotiate a discount or a settlement. Hand it to the owner.

These are the same guards the engine will enforce later. Practising them by hand is how you
find out which ones you got wrong on paper.

## 4. The daily digest (19:00 IST)

One WhatsApp message. This is you testing [`docs/01`](../docs/01-product-spec.md) §4.5 by
hand — including whether they read it at all.

```
Namaste Sharma ji, aaj ka update:

✅ Aaya: ₹1,20,000 (Gupta Industries)
📅 Vaada mila: ₹3,40,000 — Verma Traders, 28 tarikh
⚠️  Aapko dekhna hai:
    · Singh Auto — quality ka issue bata rahe hain, ₹85,000
    · Bansal Cycle — 47 din ho gaye, koi reply nahi.
      43B(h) letter bhejun? Haan/Nahi
```

**Track whether they reply.** If the owner ignores the digest for three days running, that
is a real product finding: reply-to-approve will not work for this customer, and you need to
know that before you build it.

## 5. What you are really collecting

| Artefact | Use later |
|---|---|
| Every buyer reply, verbatim | Classifier eval set — target 150+ labelled examples |
| Your own classification of each | The labels for that set |
| Which templates got replies | Copy for Meta template submission (week 6) |
| Which templates got no reply | What to cut |
| Time spent per customer per day | Proves the automation is worth building |
| Rupees recovered | The case study. **Get a testimonial on video** |
| Every objection at rung 5 | Whether the legal pack is the moat you think it is |

**Save every message.** Export the WhatsApp chats at the end of the pilot. That corpus is
worth more than the ₹7,500.

## 6. Day 30 — the review call

Ask, and write down the answers verbatim:

1. Kitna paisa aaya jo shayad nahi aata?
2. Aapne khud kitne phone kiye is mahine? (compare to before — this is job #2)
3. Kisi buyer ne kuch bura kaha?
4. Kya ye kaam machine kar sakti hai, ya insaan hi chahiye?
5. **Agar main ye automatic kar doon, ₹2,500/month doge?**

Question 5 is the actual conversion. If they say yes, you have your first subscription
customer and Phase 1 has a live target to build against.

## 7. Success criteria

| Metric | Pass |
|---|---|
| Pilots sold | **3 of 3** — this is the gate |
| Rupees recovered per pilot | ≥ ₹2 lakh |
| Owner's own chase calls | Down noticeably, self-reported |
| Buyer relationships damaged | **0** |
| Labelled replies collected | ≥ 150 |
| Convert to paid subscription at day 30 | ≥ 2 of 3 |

**If 2 of 3 convert, build.** If 0 convert but the money moved, the problem is your pricing
or your conversion ask, not the product — re-run the day-30 call with a different framing
before concluding anything.

If the money did not move, do not build. Write down honestly why, and go back to
[`02-outreach-list.md`](02-outreach-list.md) §5.
