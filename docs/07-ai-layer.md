# 07 — AI Layer

## 1. Where AI is actually used

Be precise about this. Most of the product is a state machine and a queue, not a model.
The AI does four jobs:

| Job | Volume | Latency need | Why AI and not code |
|---|---|---|---|
| **Classify inbound buyer replies** | ~200/org/month | Seconds | Hinglish, Gujlish, voice-note transcripts, screenshots, typos, and 50 ways to say "paisa aa jayega" |
| **Reply inside the 24h service window** | ~80/org/month | Seconds | Genuinely open-ended, and tone control matters |
| **Draft legal letters** | ~5/org/month | Minutes | Cite the right sections, get the regional language register right |
| **Map upload columns on first sync** | Once per org | Minutes | Tally export headers vary wildly by version |

**Not AI:** outbound reminder text (WhatsApp templates are pre-approved and fixed),
escalation decisions (pure state machine), interest computation (arithmetic — never let a
model do the numbers on a legal document).

## 2. Model

`claude-opus-5` via `@anthropic-ai/sdk`, with adaptive thinking.

```typescript
import Anthropic from "@anthropic-ai/sdk";
const client = new Anthropic();   // resolves ANTHROPIC_API_KEY from env
```

## 3. Job 1 — inbound classification

Structured output with Zod, so the result is schema-valid or it fails loudly.

```typescript
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

const Classification = z.object({
  intent: z.enum([
    "PROMISE_TO_PAY", "ALREADY_PAID", "DISPUTE", "NEEDS_DOCUMENT",
    "PARTIAL_PAYMENT", "WRONG_NUMBER", "HOSTILE", "UNCLEAR", "OTHER",
  ]),
  confidence: z.number().min(0).max(1),
  promised_date: z.string().nullable(),        // ISO; resolve "agle hafte" against today
  amount_paise: z.number().nullable(),
  dispute_reason: z.string().nullable(),
  requested_document: z.string().nullable(),
  utr_or_reference: z.string().nullable(),     // payment ref, if the buyer quoted one
  detected_language: z.string(),
  tone: z.enum(["COOPERATIVE", "NEUTRAL", "EVASIVE", "HOSTILE"]),
  reasoning: z.string(),                        // one line, for the audit log
});

const res = await client.messages.parse({
  model: "claude-opus-5",
  max_tokens: 2000,
  thinking: { type: "adaptive" },
  output_config: {
    effort: "low",                              // classification, not deep reasoning
    format: zodOutputFormat(Classification),
  },
  system: [{ type: "text", text: CLASSIFIER_SYSTEM, cache_control: { type: "ephemeral" } }],
  messages: [{ role: "user", content: buildContext(invoice, buyer, history, inbound) }],
});

if (!res.parsed_output) throw new ClassificationFailed(res);  // null on parse failure
```

Two things to note: `parsed_output` is **null** when parsing fails — always guard it, never
`!`-assert in production. And the system prompt is marked `cache_control` because it is
identical on every call; cache reads make the dominant cost term collapse.

### Classifier system prompt (the substance)

```
You classify replies from Indian B2B buyers to payment-reminder messages sent by their
supplier. Input may be Hindi, Hinglish, Gujarati, Marathi, Tamil, Punjabi or English,
often transliterated in Latin script, often with typos or voice-note transcripts.

Rules:
- "paisa aa jayega" / "dekhte hain" / "process me hai" with NO date is EVASIVE, not a
  promise. Only emit PROMISE_TO_PAY when a date is stated or clearly derivable.
- Resolve relative dates against {{today_ist}} in Asia/Kolkata.
  "agle hafte" → the next Monday. "month end" → the last day of the current month.
  "15 tarikh" → the 15th of the current month, or next month if the 15th has passed.
- A quoted UTR, cheque number or "payment kar diya" is ALREADY_PAID even without proof.
  Never auto-settle the invoice; flag for reconciliation.
- Quality complaints, short supply, rate disputes and pending credit notes are DISPUTE,
  not evasion — even when politely worded.
- HOSTILE means abuse, threats, or an explicit demand to stop contacting. Err toward
  HOSTILE: a false positive costs one handoff, a false negative costs a relationship.
- If the sender says they are not the right person or don't know this supplier,
  that is WRONG_NUMBER.
- When genuinely ambiguous, return UNCLEAR with confidence below 0.5. A human will read
  it. Do not guess to appear useful.

Return only the structured object.
```

Two prompt decisions that matter more than they look:

- **"dekhte hain" is not a promise.** This is the highest-frequency reply in the whole
  dataset. If it pauses the ladder, the entire product stops collecting and the customer
  churns in month two.
- **Err toward HOSTILE.** Asymmetric costs. A false positive costs one owner handoff; a
  false negative sends rung 4 to a furious buyer and ends a trading relationship — the one
  thing we promised would not happen.

### Confidence gate

```
confidence >= 0.85 and intent is auto-actionable  → act
confidence <  0.85                                → needs_human = true, into the digest
intent == HOSTILE at any confidence               → immediate owner alert, stop the ladder
```

Start at 0.90 and only lower it once you have a labelled set. Sample 100 classifications
weekly and hand-label them — this set is also your eval set and your future fine-tuning data.

## 4. Job 2 — service-window replies

Free-form, allowed only inside an open 24-hour window. Hard constraints in the system
prompt: never negotiate a discount, never accept a settlement, never make a commitment on
the supplier's behalf, never threaten. Answer the question, restate the amount and date,
offer the payment link, and hand off to the owner when the buyer asks for anything we are
not authorised to give.

Anything touching money terms is a `HANDOFF_TO_OWNER`, not a reply.

## 5. Job 3 — legal drafting

The AI drafts **prose**; it never computes. Interest under MSMED s.16 is calculated in
TypeScript with `BigInt`, the numbers are passed in as facts, and the model's job is to
produce a correct, correctly-registered letter around them. The computation is frozen into
`legal_document.computation` so the PDF can always be re-derived and defended.

See [doc 08](08-legal-pack.md).

## 6. Cost model

Per classification, with the system prompt cached:

```
input   ~1,500 tok, mostly cache reads
output  ~200 tok
                                    ≈ $0.007  ≈ ₹0.62 per classification
```

Per org per month: ~200 classifications + ~80 service replies + ~5 letters ≈ **₹124**.
Combined with WhatsApp (~₹81) and infra (~₹30), COGS ≈ **₹235/org/month** — see
[doc 05](05-whatsapp-layer.md).

**Cost levers, in order, when this stops being negligible:**

1. **Prompt caching** — already assumed above. Verify with `usage.cache_read_input_tokens`;
   if it reads zero across calls, something volatile has crept into the prefix.
2. **`effort: "low"`** — already set. Classification does not need deep reasoning.
3. **Batch the non-urgent work.** Column mapping and weekly eval runs can go through the
   Batch API at 50% cost. Classification cannot — it is latency-sensitive.
4. **Evaluate a cheaper model for the bulk classifier.** `claude-haiku-4-5` ($1/$5 per MTok)
   would cut this line ~80%. **This is your call, not a default** — run it against the
   labelled eval set first and only switch if accuracy on `PROMISE_TO_PAY` date extraction
   and `HOSTILE` recall holds. Those two are where a cheaper model will fail first, and both
   are expensive to get wrong.

At ₹235 COGS against ₹2,499–14,999 pricing, none of this is urgent. Instrument it, revisit
at 500 orgs.

## 7. Evals — build this in week 3, not month 6

`packages/ai/evals/` with a labelled set of real buyer replies.

- **Seed it from the concierge pilots.** Phase 0 hand-chasing produces exactly the corpus
  you need, in the real languages, from the real buyers. Save every message.
- Target ≥ 150 labelled examples before the classifier ships to a paying customer.
- Metrics that matter: `PROMISE_TO_PAY` precision (a false promise silently stops
  collection), promised-date extraction accuracy, and `HOSTILE` **recall** (a miss costs a
  customer relationship).
- Run the eval in CI on every prompt change. A prompt edit is a production change.

Regressions here are invisible in ordinary testing — the system keeps running, it just
quietly stops collecting money. The eval is the only thing that catches that.
