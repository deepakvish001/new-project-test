# 09 — Security & DPDP Compliance

We hold two sensitive things: our customers' **receivables ledgers** (competitively
explosive in a cluster where everyone knows everyone) and their **buyers' contact details**
(personal data under the DPDP Act).

## 1. DPDP timeline — why this is a v1 concern, not a v2 one

| Date | What happens |
|---|---|
| 13 Nov 2025 | Data Protection Board active |
| 13 Nov 2026 | Consent Manager framework comes into force |
| **13 May 2027** | **Full compliance. Hard enforcement.** |

We will be signing customers through that window. A prospect's CA *will* ask about it in
2027, and "we'll handle it later" loses the deal. Building compliant from the start costs
weeks; retrofitting costs a rewrite. Typical SME compliance runs ₹3–8 lakh/year — being
able to say "we are already compliant" is a sales asset, not just a cost.

## 2. Our role: Data Processor, not Fiduciary

This distinction determines everything.

- Our **customer** (the manufacturer) is the **Data Fiduciary** for their buyers' data. It
  is their trade relationship and their data.
- **We are a Data Processor** acting on their documented instructions.

Consequences that must be built, not just written:

1. **A Data Processing Agreement** is part of the standard terms — not an enterprise-only
   addendum. Our smallest customer needs it too.
2. **No cross-org data use.** We never use org A's buyer data to serve org B. This is
   enforced by RLS ([doc 03](03-data-model.md) §5), not by convention.
3. **Deletion propagates.** When a customer deletes a buyer or closes their account, it is a
   real delete within 30 days, except records under statutory retention.
4. **We do not train models on customer data.** State this plainly in the terms. It is also
   why the aggregate credit-risk model ([doc 12](12-metrics-risks.md)) needs an explicit,
   separately-consented legal basis — do not assume the DPA covers it, because it does not.

## 3. Legal basis for messaging a buyer

The buyer never signed up with us. This is the question a CA will ask, so have the answer:

- The buyer is the customer's **existing trade counterparty**.
- The message concerns an **unpaid invoice between those two parties**.
- The phone number came from the **customer's own books**, provided by the buyer for
  business communication.
- It is a **legitimate business communication**, sent by the supplier, through us as
  processor.

Operational obligations regardless of basis:
- **Honour opt-out instantly** (ladder guard 3). A `STOP` is final.
- **Identify the sender clearly** — every message names the supplier, never "Bakaya".
- **Never message a number the customer did not give us.** No enrichment, no lookups, no
  buying data. Ever.

## 4. Security controls

### Data at rest
- Postgres encrypted at rest, `ap-south-1` only. No replica outside India.
- S3 with SSE-KMS; invoice PDFs and legal letters under a customer-scoped prefix.
- `buyer_contact.whatsapp_e164` — plain column (we must query it on every inbound webhook),
  but the table is RLS-protected and the column is excluded from all analytics exports.

### Data in transit
- TLS 1.3 everywhere.
- Tally connector → api: **mTLS** with a per-org client certificate issued at onboarding.
  An org token alone is not enough for a channel carrying a company's entire ledger.

### Access
- No engineer has standing production database access. Break-glass only: time-boxed,
  approved, and logged.
- Support tooling reads through the same RLS-scoped role as the app.
- Every admin action that touches customer data writes an audit row.

### Secrets
- AWS Secrets Manager. Nothing in env files on disk, nothing in the repo.
- `ANTHROPIC_API_KEY`, Meta app secret, Razorpay keys rotate quarterly.
- **A leaked Meta app secret lets someone read every customer's buyer conversations.** Treat
  it at the same tier as the database password.

### Third-party sub-processors (disclose all of them)

| Processor | Data | Location |
|---|---|---|
| Anthropic (Claude API) | Inbound message text, invoice metadata | Per API terms |
| Meta (WhatsApp Cloud API) | Phone numbers, message content | Meta infrastructure |
| Razorpay | Invoice amount, payer details | India |
| AWS | Everything | ap-south-1 |

The Claude API call is our main data egress. Minimise what goes in it: send the message
text, the invoice number, amount and days overdue. **Do not send the buyer's phone number,
the full ledger, or anything the classifier does not need.** Redact at the boundary in
`packages/ai`, not at the call site.

## 5. Retention

Per [doc 03](03-data-model.md) §6. The two rules that need enforcement jobs, not policy
documents:

- **Raw AI classification inputs: 90 days.** Then delete the text, keep the label and
  confidence. This keeps the eval set useful while shrinking the personal-data footprint.
- **Buyer contacts: purge 12 months after the last open invoice with that buyer closes.**

Write both as scheduled jobs in week 1 of building. A retention policy with no cron job
behind it is a document, not a control — and that is exactly what an auditor will find.

## 6. Pre-launch checklist

- [ ] DPA in the standard terms, reviewed by a lawyer
- [ ] Privacy policy naming every sub-processor above
- [ ] RLS isolation test running in CI on every commit
- [ ] Retention jobs written and scheduled
- [ ] Secrets in Secrets Manager, none on disk
- [ ] mTLS on the connector ingest endpoint
- [ ] Break-glass DB access procedure documented and tested once
- [ ] Opt-out path tested end-to-end from a real WhatsApp `STOP`
- [ ] Incident response runbook — specifically "what if our Meta number is compromised"
- [ ] Record of Processing Activities started (DPDP requires it; start it while it's small)
