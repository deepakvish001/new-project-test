# 05 — WhatsApp Layer

The channel decision drives the unit economics, so get this right before writing code.

## 1. BSP or direct?

**Start on a BSP (AiSensy / Interakt / Wati), migrate to Meta Cloud API direct at ~50 orgs.**

| | BSP | Meta Cloud API direct |
|---|---|---|
| Time to first message | Hours | 1–2 weeks (Business verification) |
| Template submission | Their UI | Our API |
| Per-message cost | Meta rate **+ 10–30% markup** | Meta rate |
| Platform fee | ₹1,000–3,000/mo | ₹0 |
| Multi-tenant numbers | Usually clumsy | Clean, via Embedded Signup |

The BSP markup is 10–30% on a ₹0.115 message — irrelevant at 10 customers, real at 500.
More importantly, at scale we need **one WhatsApp sender number per customer org** (a
manufacturer's buyers must see *their* brand, not ours), and Embedded Signup direct with
Meta is the clean way to do that.

**Design implication from day one:** wrap everything in `packages/whatsapp` behind an
interface. The BSP is an implementation detail we intend to delete.

```typescript
export interface WhatsAppPort {
  sendTemplate(p: SendTemplateParams): Promise<{ waMessageId: string; costPaise: number }>;
  sendFreeform(p: SendFreeformParams): Promise<{ waMessageId: string }>;  // 24h window only
  uploadMedia(buf: Buffer, mime: string): Promise<{ mediaId: string }>;
  verifyWebhook(sig: string, body: Buffer): boolean;
}
```

## 2. Costs (India, as of 1 July 2026)

Meta charges per message, billed in INR:

| Category | Rate | + 18% GST | Use |
|---|---|---|---|
| **Utility** | ₹0.1150 | ₹0.1357 | ✅ Every ladder rung. This is our category. |
| Authentication | ₹0.1150 | ₹0.1357 | Not used |
| **Marketing** | ₹0.8631 | ₹1.0185 | ❌ **Never.** 7.5× the cost and wrong category. |

Two things that changed in 2026 and that the model must account for:

- Marketing rates rose ~10% (₹0.7846 → ₹0.8631). Utility and auth were unchanged.
- **From 1 October 2026, service messages are no longer free.** Each business phone number
  gets **1,000 free service messages/month**; beyond that they bill at the service rate.

Utility and auth get **volume discounts up to 30%** off list as monthly volume grows.
Marketing has no volume tiers.

### Why every reminder must be a *utility* template

A payment reminder tied to an existing transaction is legitimately a utility message. Meta
approves these. If templates get miscategorised as marketing, COGS jumps 7.5× and the
margin model breaks. **Category is reviewed at approval time — write templates that read as
transactional, and never include a promotional sentence.**

### COGS per customer per month

Customer with 200 active invoices, ~3 touches each:

```
Outbound utility     600 × ₹0.1357              = ₹  81
Service replies      ~400, first 1,000 free     = ₹   0
Claude classification (doc 07)                  = ₹ 124
Infra share                                     = ₹  30
                                          TOTAL ≈ ₹ 235 / month
```

Against ₹5,999 Growth pricing that is **~96% gross margin**; against ₹2,499 Starter, ~90%.
Healthy at both ends. Track `message_log.cost_paise` from day one so this stays a measured
number, not an assumption.

## 3. Template catalogue

~30 approved templates: **6 rungs × 5 languages**, plus broken-promise variants and
utility templates (document send, payment confirmation).

Naming: `bakaya_r{rung}_{variant}_{lang}` — e.g. `bakaya_r4_broken_promise_hi`.

### Example — rung 4, Hindi, firm

```
Namaste {{1}} ji,

{{2}} ki taraf se invoice {{3}} (₹{{4}}) ab {{5}} din overdue hai.
Due date thi {{6}}.

Payment ke liye: {{7}}

Agar payment ho chuka hai to please UTR bhej dijiye, hum record update kar denge.
Koi issue ho to bata dijiye.
```

Variables: contact name, supplier name, invoice no., amount, days overdue, due date,
payment link.

### Template writing rules

1. **Transactional language only.** No "offer", "discount", "click now". One promotional
   word can get the template classified as marketing.
2. **Always give an off-ramp** — "if already paid, send the UTR", "if there's an issue, tell
   us". This is what converts a dunning message into a conversation, and a conversation is
   what actually gets invoices paid.
3. **Never threaten at rungs 1–4.** Legal language appears only at rungs 5–6, and only
   after owner approval.
4. **Get the register right per language.** Hindi should read like a Ludhiana accounts
   person wrote it, not like a translated English legal notice. Have a native speaker from
   the target cluster review every template before submission — not Google Translate, and
   not the LLM alone.

## 4. Quality rating — the existential operational risk

Meta scores each sender number Green / Yellow / Red based on block and report rates. Red
means messaging limits collapse and eventually the number is disabled. **For a dunning
product this is the single most likely way to die.**

Mitigations, all of which are product requirements not nice-to-haves:

| Control | Implementation |
|---|---|
| One sender number **per customer org** | Blast radius of one angry buyer base is one org, not the whole platform |
| Honour `STOP` instantly | Guard 3 in the ladder; set `opted_out_at`, never message again |
| Quiet hours + no weekends | `org_policy.quiet_hours` default 21:00–09:00 IST |
| Rate limit per number | ≤ 200 business-initiated messages/day/number in v1 |
| Stop on hostility | Guard 5 → immediate handoff, ladder stops |
| Never dun a disputed invoice | Guard 6 |
| Monitor quality daily | Poll the Meta phone-number quality field; auto-pause an org's ladder on Yellow and alert |
| Never send to a number the buyer didn't give us | Only numbers present in the customer's own Tally/ledger data |

**Legal basis for messaging:** the buyer is the customer's existing trade counterparty and
the message concerns an unpaid invoice between them. That is a legitimate business
communication, and our customer — not us — has the underlying relationship. We are a data
processor here. See [doc 09](09-security-dpdp.md).

## 5. Inbound webhook

```
POST /webhooks/whatsapp
  1. Verify X-Hub-Signature-256 (HMAC-SHA256, app secret). Mismatch → 401, log, drop.
  2. Upsert inbound_message ON CONFLICT (wa_message_id) DO NOTHING.   ← idempotent
  3. Return 200 within 5 seconds. Meta retries hard on slow responses.
  4. Enqueue inbound-classify.
```

Never classify inline in the webhook handler. A slow Claude call means Meta retries, which
means duplicate classification and duplicate promises.

Status callbacks (`sent` / `delivered` / `read` / `failed`) update `message_log.status`.
A `failed` with code 131026 (undeliverable) should deactivate the contact and surface it to
the owner — a wrong number silently eating the whole ladder is a real and common failure.

## 6. The 24-hour service window

When a buyer messages us, a 24-hour window opens in which we can send free-form replies —
this is where AI-generated text is allowed. Outside the window, only approved templates.

The engine tracks `serviceWindowExpiresAt` per contact. Two consequences:

- Rung 1 (pre-due courtesy) earns its place partly by opening windows cheaply.
- When a buyer asks a question at hour 23, answer *now*, not on the next tick. The
  `inbound-classify` job runs immediately on receipt, not on a schedule.

Remember service messages start billing on 1 Oct 2026 beyond 1,000/number/month — at ~400
service messages per org per month we sit under the free tier, but instrument it.
