# 01 — Discovery Call Script (20 calls)

**Goal of these calls: learn, not sell.** You are testing whether the problem is real and
expensive enough that someone will hand you money. A call where you "explained the product
well" and learned nothing is a failed call.

## The three rules

1. **Never pitch.** The moment you describe the product, they start being polite and the
   data goes bad. If they ask "aap kya bech rahe ho?", say: *"Abhi kuch bech nahi raha.
   MSME receivables par research kar raha hoon, 10 minute chahiye the."*
2. **Ask about the past, never the future.** "Kya aap ye use karoge?" → useless. "Pichhli
   baar jab ek buyer ne 90 din laga diye, aapne kya kiya?" → gold.
3. **Chase the money.** Every answer should move toward a number: rupees, days, hours,
   or what they already spend.

---

## Opening (30 seconds)

> Namaste, [Name] ji. Main [Your Name] bol raha hoon.
>
> Main MSME manufacturers ke साथ ek research kar raha hoon — udhaar wapas aane mein kitna
> time lagta hai, uspar. Aapka naam [association / IndiaMART / referral source] se mila.
>
> **10 minute hai aapke paas? Main kuch bech nahi raha — sirf samajhna chahta hoon ki
> aapke yahan ye kaam kaise chalta hai.**

If they're busy: *"Koi baat nahi — kal subah 11 baje theek rahega?"* Book it, don't lose it.

---

## The 9 questions, in order

Order matters. Facts first, feelings later, money at the end.

### Q1 — Warm-up, establish scale
> Aap kya banate ho, aur zyadatar kisko bechte ho — OEM, dealer, ya direct?

*Listening for:* B2B vs B2C (B2C = not our customer, end the call politely), buyer
concentration, whether they sell on credit at all.

### Q2 — The core number
> Abhi is waqt kitna paisa market mein atka hua hai?

Silence after this. Let them do the math out loud. If they don't know the number offhand,
**that itself is the finding** — write it down.

*Follow-up:* `Usme se kitna 90 din se upar ka hai?`

### Q3 — The days
> Invoice bhejne se paisa aane tak average kitne din lagte hain? Aur terms kya likhte ho —
> 30 din, 45, 60?

*Listening for:* the gap between agreed terms and reality. That gap is the product.

### Q4 — Who does the work
> Paisa maangne ka kaam kaun karta hai — aap khud, ya koi accounts wala?
>
> Hafte mein kitna time chala jaata hai ismein?

*Listening for:* if the **owner** does it, that's our customer. If a dedicated collections
person does it, ask their salary — that is the budget we compete for.

### Q5 — The story question (most important)
> Pichhli baar jab kisi buyer ne 90 din se zyada laga diya — **kya hua tha? Aapne kya kiya?**

**Shut up and let them talk.** Two full minutes. This is where you learn the real workflow,
the real emotions, and the exact words they use. Those words become your WhatsApp templates.

*Follow-ups:* `Kitne baar phone kiya?` · `Kya bola aapne?` · `Paisa aaya aakhir mein?`
· `Kitne din baad?`

### Q6 — The fear
> Kya kabhi aisa laga ki zyada takaada karunga to buyer haath se nikal jayega?

Almost everyone says yes. Get the specific story. This validates our approval-gate and
tone-control design — and if nobody says yes, that part of the product is wrong.

### Q7 — The legal lever
> 43B(h) ka pata hai aapko? Woh income tax wala rule ki buyer ko 45 din mein pay karna
> padta hai MSME ko, warna uska deduction nahi milta?
>
> *(if yes)* Kabhi use kiya? · *(if no)* Aapke CA ne kabhi bataya nahi?

*Listening for:* awareness vs. use. Our bet is high awareness, near-zero use. **If they're
already using it effectively, our biggest differentiator is weaker than we think** — that
is a finding worth changing the plan over.

### Q8 — Current spend ← the real qualifier
> Abhi is problem par kuch kharch ho raha hai? Collections ke liye koi banda, CA ki fees,
> ya koi software?

*Listening for:* an existing budget line. A salary, a factoring discount, a CA's time.
**No existing spend means we are creating a budget, which is 10× harder than replacing one.**

### Q9 — The close (only now)
> Main ek cheez bana raha hoon jo ye follow-up WhatsApp par automatically karti hai — aapke
> naam se, aapki bhasha mein, aur 45 din ke baad legal notice bhi draft kar deti hai.
>
> Abhi product ready nahi hai. Lekin main **3 logon ke liye ye kaam 30 din tak haath se
> karke dikhane wala hoon — ₹2,500 mein.** Aap Tally se outstanding ka Excel dete ho, baaki
> main karta hoon.
>
> **Interested ho?**

---

## Reading the answer

| They say | Means | Do |
|---|---|---|
| "Haan, kaise karna hai?" | 🟢 Real pain, real budget | Take payment **on the call**. UPI now, not "bhej doonga" |
| "Interesting hai, thoda soch ke batata hoon" | 🟡 Polite no | `Kya soch-na hai? Kya cheez clear nahi?` Real objection is in that answer |
| "Free mein try kara do" | 🔴 Not a customer | Stay friendly, don't discount. Note it and move on |
| "Mera accountant ye kar leta hai" | 🟡 | `Usko kitna time lagta hai? Aur 90+ din wale par kya karta hai?` |

**The ₹2,500 is not revenue. It is the signal.** A person who pays ₹2,500 will pay ₹5,999.
A person who says "haan zaroor bhejiye" and doesn't pay has told you nothing.

---

## What NOT to say

- ❌ "AI se" — ye word Indian MSME owner ko sceptical banata hai, impressed nahi
- ❌ "Automation", "SaaS", "platform", "dashboard"
- ❌ "Kya aap ₹5,000/month doge?" — hypothetical price questions produce fake answers
- ❌ Any feature list. Nobody asked
- ❌ Arguing with an objection. Write it down and move on

✅ Say instead: *"machine se"*, *"WhatsApp par apne aap"*, *"aapke naam se"*.

---

## After every call — 5 minutes, non-negotiable

Fill one row in [`05-call-log-template.csv`](05-call-log-template.csv) **immediately**. Not
at the end of the day — you will have forgotten the exact words, and the exact words are
the point.

Record calls where permitted (*"main record kar loon, notes ke liye?"*). These recordings
become:

- your WhatsApp template copy, in the register real buyers actually use
- the seed of your classifier eval set ([`docs/07-ai-layer.md`](../docs/07-ai-layer.md) §7)
- the quotes in your CA pitch and your investor deck

## Daily target

**4 calls a day × 5 days = 20 calls in week 1.** Expect a 30–40% pickup rate on cold calls,
so dial ~12 numbers a day. Association referrals convert far better — start there.
