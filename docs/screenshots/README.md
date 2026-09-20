# Screenshots

Every page of the dashboard, captured from the running app against the seeded demo
database — not mockups. Regenerate with:

```bash
./scripts/demo.sh                    # database + seed + dashboard on :3100
node scripts/screenshots.mjs         # light
THEME=dark node scripts/screenshots.mjs
```

| # | Page | What it shows |
|---|---|---|
| 01 | [Dashboard](01-dashboard.png) | Outstanding, 90+ bucket, collected, DSO · ageing by bucket · tonight's WhatsApp digest · what needs the owner |
| 02 | [Invoices](02-invoices.png) | The full book with live ladder state per invoice — paused, stopped, needs approval |
| 03 | [Invoice · needs approval](03-invoice-needs-approval.png) | The engine asking for a human before a legal rung |
| 04 | [Invoice · promise held](04-invoice-promise-held.png) | The ladder suppressed because the buyer gave a date. **The silence is the product.** |
| 05 | [Invoice · dispute](05-invoice-dispute.png) | A dispute stops the ladder and hands it to the owner, instead of sending rung 4 on schedule |
| 06 | [Buyers](06-buyers.png) | Outstanding per buyer, worst ageing, broken promises, risk — the seed of the payment-behaviour data moat |
| 07 | [Inbox](07-inbox.png) | Buyer replies classified by intent and confidence; above 0.85 acted on automatically, below it waiting for a human |
| 08 | [Approvals](08-approvals.png) | 43B(h) queue with the MSMED s.16 interest computed in code, rest by rest |
| 09 | [Settings](09-settings.png) | Ladder offsets, tone, sending window, and the safety switches that cannot be turned off |
| 10 | [Import data](10-onboarding.png) | CSV upload, the Tally connector, and setup progress |
| 11 | [CA portal](11-ca-portal.png) | Multi-client view and commission — the distribution channel, built early on purpose |

Each page also has a `-dark.png` variant.

## What is real in these screenshots

- **Every number** is read live from PostgreSQL through the RLS-scoped app role.
- **Every "what the engine will do next" panel** is computed at render time by
  `packages/ladder` — the same pure function the 131 tests cover. It is not a stored field.
- **Every interest figure** on the approvals page comes from `packages/legal`, computed in
  `BigInt` paise against the versioned RBI bank-rate table.

## What is demo data

- Company names, GSTINs, contacts and phone numbers are synthetic. They are shaped like
  the real thing so the screens read like a real book; they identify nobody.
- Inbound message classifications are seeded, not produced by a live Claude call — the
  classifier is specified in `docs/07-ai-layer.md` and not yet built.
- The CA portal's client list is illustrative, except Arora Precision which is live.
