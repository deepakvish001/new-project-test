# 06 — Tally Integration

Getting data *in* is the hardest part of onboarding, and onboarding friction is what kills
Indian SMB SaaS. Three modes, in order of preference — but **ship mode C first**, because
it is what lets a pilot start in 20 minutes.

## 1. How Tally actually exposes data

Tally Prime runs a local HTTP server on **port 9000** when the ODBC/HTTP gateway is enabled
(`F1 → Settings → Connectivity → Client/Server configuration`). You POST an XML envelope
to `http://<tally-host>:9000` and it returns XML.

Reads cover ledgers, groups, stock items, day-book vouchers and **outstanding/bills
receivable**, which is exactly our payload. Writes can create/alter vouchers — we
deliberately never use write access.

```xml
<ENVELOPE>
  <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
  <BODY><EXPORTDATA><REQUESTDESC>
    <REPORTNAME>Bills Receivable</REPORTNAME>
    <STATICVARIABLES>
      <SVCURRENTCOMPANY>ACME ENGINEERING</SVCURRENTCOMPANY>
      <SVFROMDATE TYPE="Date">20250401</SVFROMDATE>
      <SVTODATE   TYPE="Date">20260919</SVTODATE>
    </STATICVARIABLES>
  </REQUESTDESC></EXPORTDATA></BODY>
</ENVELOPE>
```

Practical realities to design around:

- Tally must be **running**, with the right company **open**. It is a desktop app on
  someone's Windows PC that gets switched off at night.
- The XML is verbose, inconsistently typed, and dates come back as `YYYYMMDD` strings.
- Responses can be non-UTF-8 and contain invalid XML entities. **Sanitise before parsing.**
- There is no pagination and no change feed. You pull a full report and diff it yourself.

## 2. Mode A — the connector (the real product)

A small **Windows tray app** (Node + `pkg`, ~15 MB installer) on the machine running Tally.

```
┌── Customer's Windows PC ───────────┐        ┌── our api (ap-south-1) ──┐
│  Tally Prime  :9000                │        │                          │
│       ▲                            │        │  POST /ingest/tally      │
│       │ XML over localhost         │        │    mTLS + org token      │
│  bakaya-connector (tray)  ─────────┼───────▶│    body: gzip JSON       │
│    · pulls every 60 min            │  HTTPS │                          │
│    · outbound only                 │  only  │                          │
└────────────────────────────────────┘        └──────────────────────────┘
```

**Design rules:**

1. **Outbound connections only.** The connector never listens on a port and we never dial
   into the customer's network. This is both a security requirement and the only thing that
   makes it installable past a suspicious IT person or the owner's own instinct.
2. **Read-only Tally user.** Onboarding creates a dedicated least-privilege Tally user for
   the integration.
3. **Bind Tally's 9000 to localhost.** If the customer has it exposed on the LAN, fix that
   during onboarding — it is an unauthenticated read/write gateway to their books.
4. **Survive being offline.** Queue locally, backfill on reconnect, and surface
   "last synced 3 days ago" prominently in the dashboard and the digest. A silently stale
   sync means we dun invoices that were already paid — the worst possible failure.
5. **Auto-update.** We will change the payload. Assume nobody will ever re-run an installer.

### Payload

The connector normalises before sending — we keep Tally's ugliness on the customer's
machine, not in our database:

```typescript
interface TallySyncPayload {
  companyName: string;
  syncedAt: string;                     // ISO, connector clock
  connectorVersion: string;
  bills: Array<{
    externalRef: string;                // Tally voucher GUID — stable, use this
    invoiceNumber: string;
    ledgerName: string;                 // raw, becomes a buyer_alias
    gstin: string | null;
    invoiceDate: string;                // normalised to ISO by the connector
    dueDate: string | null;             // Tally "bill credit period" if present
    amountPaise: string;                // string → parsed to BigInt server-side
    pendingPaise: string;
  }>;
}
```

`amountPaise` crosses the wire as a **string**. `JSON.parse` on a large number silently
loses precision; a string → `BigInt` is exact.

## 3. Mode B — GSTR-1 import

The customer downloads their GSTR-1 JSON from the GST portal and uploads it. Gives us B2B
invoices with GSTIN, number, date and value — no payment status, so we ask them to mark
what's already settled, or we combine it with a ledger upload.

Good for: customers who don't run Tally, and a fast way to build the buyer list with clean
GSTINs (which is what makes dedupe work).

## 4. Mode C — CSV / XLSX upload ← **build this first**

Customer exports "Bills Receivable" from Tally to Excel (three clicks, every Tally user
knows how) and drops the file in.

Why it ships first:
- A pilot can start **the same day**, with no installer and no IT conversation.
- It is exactly what the Phase 0 concierge pilots ([doc 10](10-roadmap.md)) need.
- Column mapping teaches us the real shape of the data across Tally versions before we
  hard-code assumptions into a connector.

Use Claude to map arbitrary column headers to our schema on first upload, then save the
mapping per org. Tally exports vary by version and by whatever the accountant renamed.

## 5. Reconciliation

Every sync is a diff, not a replace:

```
for each incoming bill:
  match on (org_id, source_system, external_ref)
    ├─ new           → INSERT invoice, resolve/create buyer, rung 0, schedule rung 1
    ├─ hash changed  → UPDATE source fields ONLY (amount, dates, pending)
    │                  NEVER touch current_rung / next_action_at / status
    └─ unchanged     → skip

for each invoice we have that is absent from the sync:
    → it was deleted or settled in Tally.
      Mark status=PAID with method='reconciled_tally', STOP the ladder.
      Do NOT delete — we keep the evidence trail.
```

**The dangerous case:** invoice paid in Tally, our sync fails for two days, we keep dunning.
Mitigations: the digest surfaces sync staleness; if `last_successful_sync > 48h`, **the
ladder pauses automatically** for that org. Silence is always safer than dunning a buyer who
already paid.

## 6. Buyer deduplication

The single messiest part of this integration. Tally ledger names are free text.

```
1. GSTIN present on both sides                        → match (authoritative)
2. Normalise: lowercase, strip PVT/LTD/LLP/& CO/ENTERPRISES/TRADERS,
   collapse whitespace, strip punctuation                → exact match on normalised_name
3. Trigram similarity > 0.85 on normalised_name         → propose, ask the owner once
4. Otherwise                                            → new buyer
```

Every raw ledger name we see is recorded in `buyer_alias`. If we get a merge wrong, the
owner can split it — and the alias table makes that reversible.

Step 3 (ask the owner once) is worth the friction. One duplicate buyer means two parallel
ladders into one firm, which reads as incompetence to the buyer and ends the pilot.

## 7. Other accounting systems

Priority after Tally, by installed base in our segment: **Busy** (similar XML gateway),
**Marg** (strong in pharma/FMCG distribution), **Vyapar** (mobile-first, smallest end),
**Zoho Books** (proper REST API, easiest of all — do it when a customer asks).

Every one of them lands in the same normalised `TallySyncPayload` shape. Keep the
integration surface narrow: adapters in, one payload out.
