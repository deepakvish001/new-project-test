/**
 * Demo seed: one Ludhiana auto-parts manufacturer with a realistic receivables book.
 *
 * All names, GSTINs and phone numbers are SYNTHETIC. They are shaped like the real thing
 * so the screens look like a real book, but they identify nobody. Never point this at a
 * database that holds real customer data.
 *
 *   npm run seed --workspace=@bakaya/db
 */
import { addDays, dateOfInstant, type IstDate } from "@bakaya/ladder";
import { pool } from "./client";

const ORG_ID = "11111111-1111-1111-1111-111111111111";
const today = dateOfInstant(new Date());
const d = (offset: number): IstDate => addDays(today, offset);

/** Days relative to today; negative = in the past. */
interface SeedInvoice {
  no: string;
  buyer: string;
  invoiceOffset: number;
  creditDays: number;
  amount: bigint;
  paid?: bigint;
  rung: number;
  status?: "OPEN" | "PARTIALLY_PAID" | "PAID" | "DISPUTED";
  promise?: { date: number; status: "PENDING" | "BROKEN" | "KEPT"; rung: number };
  dispute?: string;
  legalApproved?: boolean;
}

const BUYERS = [
  { name: "Hero Cycles Components Pvt Ltd", gstin: "03AABCH2702H1Z8", city: "Ludhiana", lang: "pa", contact: "Rajinder Singh", phone: "+919000000101" },
  { name: "Avon Cycle Industries",          gstin: "03AAACA1234M1Z5", city: "Ludhiana", lang: "pa", contact: "Harpreet Kaur", phone: "+919000000102" },
  { name: "Gupta Auto Traders",             gstin: "03AAFCG5678P1Z2", city: "Jalandhar", lang: "hi", contact: "Mahesh Gupta",  phone: "+919000000103" },
  { name: "Verma Engineering Works",        gstin: "06AAGCV9012R1Z7", city: "Faridabad", lang: "hi", contact: "Sunil Verma",   phone: "+919000000104" },
  { name: "Singh Auto Parts",               gstin: "03AAHCS3456T1Z4", city: "Ludhiana", lang: "pa", contact: "Gurmeet Singh",  phone: "+919000000105" },
  { name: "Bansal Cycle Stores",            gstin: "03AAICB7890W1Z1", city: "Ludhiana", lang: "hi", contact: "Ashok Bansal",   phone: "+919000000106" },
  { name: "Mahalaxmi Trading Co",           gstin: "27AAJCM2345Y1Z9", city: "Mumbai",   lang: "mr", contact: "Prakash Joshi",  phone: "+919000000107" },
  { name: "Sharma Industries",              gstin: "09AAKCS6789A1Z6", city: "Kanpur",   lang: "hi", contact: "Dinesh Sharma",  phone: "+919000000108" },
  { name: "Patel Auto Agencies",            gstin: "24AALCP0123C1Z3", city: "Rajkot",   lang: "gu", contact: "Nikhil Patel",   phone: "+919000000109" },
  { name: "Kumar Cycle Mart",               gstin: "03AAMCK4567E1Z0", city: "Ludhiana", lang: "hi", contact: "Vijay Kumar",    phone: "+919000000110" },
  { name: "National Spares Corporation",    gstin: "07AANCN8901G1Z8", city: "Delhi",    lang: "hi", contact: "Imran Qureshi",  phone: "+919000000111" },
  { name: "Deepak Metal Works",             gstin: "03AAOCD2345J1Z5", city: "Ludhiana", lang: "pa", contact: "Deepak Arora",   phone: "+919000000112" },
];

const INVOICES: SeedInvoice[] = [
  // Healthy — not yet due
  { no: "LU/26-27/0412", buyer: "Hero Cycles Components Pvt Ltd", invoiceOffset: -12, creditDays: 45, amount: 128_500_00n, rung: 1 },
  { no: "LU/26-27/0415", buyer: "Avon Cycle Industries",          invoiceOffset: -8,  creditDays: 30, amount: 86_400_00n,  rung: 0 },
  { no: "LU/26-27/0418", buyer: "Deepak Metal Works",             invoiceOffset: -5,  creditDays: 45, amount: 47_200_00n,  rung: 0 },
  { no: "LU/26-27/0420", buyer: "Kumar Cycle Mart",               invoiceOffset: -3,  creditDays: 30, amount: 22_800_00n,  rung: 0 },

  // Just due / early chase
  { no: "LU/26-27/0398", buyer: "Gupta Auto Traders",             invoiceOffset: -32, creditDays: 30, amount: 64_750_00n,  rung: 2 },
  { no: "LU/26-27/0401", buyer: "Sharma Industries",              invoiceOffset: -38, creditDays: 30, amount: 112_300_00n, rung: 3 },
  { no: "LU/26-27/0395", buyer: "Patel Auto Agencies",            invoiceOffset: -41, creditDays: 30, amount: 39_600_00n,  rung: 3 },

  // Promise given — ladder suppressed. The silence is the product.
  { no: "LU/26-27/0376", buyer: "Verma Engineering Works",        invoiceOffset: -58, creditDays: 45, amount: 340_000_00n, rung: 3,
    promise: { date: 6, status: "PENDING", rung: 3 } },
  { no: "LU/26-27/0380", buyer: "Mahalaxmi Trading Co",           invoiceOffset: -55, creditDays: 45, amount: 78_900_00n,  rung: 3,
    promise: { date: 2, status: "PENDING", rung: 3 } },

  // Broken promise — accelerated
  { no: "LU/26-27/0352", buyer: "Bansal Cycle Stores",            invoiceOffset: -71, creditDays: 45, amount: 156_000_00n, rung: 4,
    promise: { date: -9, status: "BROKEN", rung: 2 } },
  { no: "LU/26-27/0349", buyer: "National Spares Corporation",    invoiceOffset: -74, creditDays: 30, amount: 92_400_00n,  rung: 4,
    promise: { date: -14, status: "BROKEN", rung: 3 } },

  // Disputed — never dunned
  { no: "LU/26-27/0361", buyer: "Singh Auto Parts",               invoiceOffset: -66, creditDays: 45, amount: 85_000_00n,  rung: 3,
    status: "DISPUTED", dispute: "Quality issue on 200 units of BB axle — buyer claims short supply of 18 pcs" },

  // Legal territory
  { no: "LU/26-27/0318", buyer: "Bansal Cycle Stores",            invoiceOffset: -96, creditDays: 45, amount: 214_500_00n, rung: 4 },
  { no: "LU/26-27/0305", buyer: "Gupta Auto Traders",             invoiceOffset: -104, creditDays: 30, amount: 167_800_00n, rung: 4 },
  { no: "LU/26-27/0291", buyer: "National Spares Corporation",    invoiceOffset: -118, creditDays: 30, amount: 298_000_00n, rung: 5,
    legalApproved: true },
  { no: "LU/26-27/0277", buyer: "Sharma Industries",              invoiceOffset: -131, creditDays: 30, amount: 143_600_00n, rung: 5,
    legalApproved: true },

  // Partially paid
  { no: "LU/26-27/0334", buyer: "Patel Auto Agencies",            invoiceOffset: -83, creditDays: 30, amount: 188_000_00n,
    paid: 100_000_00n, status: "PARTIALLY_PAID", rung: 4 },

  // Collected — attribution for the dashboard
  { no: "LU/26-27/0402", buyer: "Hero Cycles Components Pvt Ltd", invoiceOffset: -36, creditDays: 45, amount: 245_000_00n, paid: 245_000_00n, status: "PAID", rung: 2 },
  { no: "LU/26-27/0388", buyer: "Avon Cycle Industries",          invoiceOffset: -48, creditDays: 30, amount: 132_700_00n, paid: 132_700_00n, status: "PAID", rung: 3,
    promise: { date: -4, status: "KEPT", rung: 3 } },
  { no: "LU/26-27/0371", buyer: "Kumar Cycle Mart",               invoiceOffset: -61, creditDays: 30, amount: 58_300_00n,  paid: 58_300_00n,  status: "PAID", rung: 4 },
  { no: "LU/26-27/0356", buyer: "Deepak Metal Works",             invoiceOffset: -68, creditDays: 45, amount: 94_100_00n,  paid: 94_100_00n,  status: "PAID", rung: 3 },
  { no: "LU/26-27/0342", buyer: "Verma Engineering Works",        invoiceOffset: -79, creditDays: 45, amount: 176_400_00n, paid: 176_400_00n, status: "PAID", rung: 4 },
];

/** Inbound replies, verbatim in the register real buyers use. Also the eval-set seed. */
const INBOUND = [
  { buyer: "Verma Engineering Works", body: "Dekhiye bhai, abhi thoda tight hai. 26 tarikh tak kar denge pakka.", intent: "PROMISE_TO_PAY", conf: 0.91, extracted: { promised_date: d(6), tone: "COOPERATIVE" }, daysAgo: 3, human: false },
  { buyer: "Mahalaxmi Trading Co", body: "payment process me hai, 2-3 din me aa jayega", intent: "PROMISE_TO_PAY", conf: 0.78, extracted: { promised_date: d(2), tone: "COOPERATIVE" }, daysAgo: 2, human: false },
  { buyer: "Singh Auto Parts", body: "Aapne 200 piece bheje the lekin 18 kam nikle. Pehle wo settle karo phir baat karte hain.", intent: "DISPUTE", conf: 0.94, extracted: { dispute_reason: "short supply 18 pcs", tone: "NEUTRAL" }, daysAgo: 5, human: true },
  { buyer: "Bansal Cycle Stores", body: "kitna bacha hai exactly? ledger bhejo", intent: "NEEDS_DOCUMENT", conf: 0.88, extracted: { requested_document: "ledger statement", tone: "NEUTRAL" }, daysAgo: 1, human: false },
  { buyer: "National Spares Corporation", body: "Roz roz message mat bhejo yaar. Pata hai humein.", intent: "HOSTILE", conf: 0.72, extracted: { tone: "HOSTILE" }, daysAgo: 1, human: true },
  { buyer: "Gupta Auto Traders", body: "kal NEFT kar diya tha, UTR N2609204412887 check kar lo", intent: "ALREADY_PAID", conf: 0.95, extracted: { utr_or_reference: "N2609204412887", tone: "COOPERATIVE" }, daysAgo: 0, human: false },
  { buyer: "Sharma Industries", body: "abhi nahi ho payega", intent: "UNCLEAR", conf: 0.41, extracted: { tone: "EVASIVE" }, daysAgo: 4, human: true },
  { buyer: "Patel Auto Agencies", body: "1 lakh bhej diya hai, baaki next week", intent: "PARTIAL_PAYMENT", conf: 0.89, extracted: { amount_paise: 10000000, tone: "COOPERATIVE" }, daysAgo: 6, human: false },
];

async function main() {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT set_config('app.current_org_id', $1, true)", [ORG_ID]);

    // Idempotent: wipe and rebuild this org only.
    for (const t of ["message_log", "inbound_message", "ladder_event", "legal_document",
                     "payment", "dispute", "promise", "invoice", "buyer_contact",
                     "buyer_alias", "buyer", "digest", "sync_run", "org_policy",
                     "app_user"]) {
      await c.query(`DELETE FROM ${t} WHERE org_id = $1`, [ORG_ID]);
    }
    await c.query("DELETE FROM org WHERE id = $1", [ORG_ID]);

    await c.query("SELECT set_config('app.current_org_id', $1, true)", [ORG_ID]);
    await c.query(
      `INSERT INTO org (id, legal_name, trade_name, gstin, udyam_number, pan, address,
                        default_language, wa_phone_number_id, plan, onboarded_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now() - interval '74 days')`,
      [ORG_ID, "Arora Precision Components Pvt Ltd", "Arora Precision",
       "03AABCA1234K1Z9", "UDYAM-PB-06-0012345", "AABCA1234K",
       JSON.stringify({ line1: "Plot 214, Focal Point Phase V", city: "Ludhiana",
                        state: "Punjab", pin: "141010" }),
       "hi", "seed-wa-number", "GROWTH"]);

    await c.query(
      `INSERT INTO app_user (org_id, name, phone_e164, email, role)
       VALUES ($1,$2,$3,$4,'OWNER'), ($1,$5,$6,$7,'ACCOUNTANT')`,
      [ORG_ID, "Deepak Arora", "+919000000001", "owner@example.invalid",
       "Meena Rani", "+919000000002", "accounts@example.invalid"]);

    await c.query(`INSERT INTO org_policy (org_id) VALUES ($1)`, [ORG_ID]);

    const buyerIds = new Map<string, string>();
    for (const b of BUYERS) {
      const { rows } = await c.query<{ id: string }>(
        `INSERT INTO buyer (org_id, legal_name, normalised_name, gstin, address,
                            preferred_language, credit_days)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [ORG_ID, b.name, b.name.toLowerCase().replace(/\b(pvt|ltd|co|corporation|industries|works|stores|traders|agencies|mart)\b/g, "").replace(/\s+/g, " ").trim(),
         b.gstin, JSON.stringify({ city: b.city }), b.lang, 45]);
      const id = rows[0]!.id;
      buyerIds.set(b.name, id);
      await c.query(
        `INSERT INTO buyer_contact (org_id, buyer_id, name, designation, whatsapp_e164, is_primary)
         VALUES ($1,$2,$3,'Accounts',$4,true)`,
        [ORG_ID, id, b.contact, b.phone]);
      await c.query(
        `INSERT INTO buyer_alias (org_id, buyer_id, source, raw_name)
         VALUES ($1,$2,'TALLY_CONNECTOR',$3)`,
        [ORG_ID, id, b.name.toUpperCase()]);
    }

    for (const inv of INVOICES) {
      const buyerId = buyerIds.get(inv.buyer)!;
      const invoiceDate = d(inv.invoiceOffset);
      const dueDate = addDays(invoiceDate, inv.creditDays);
      const { rows } = await c.query<{ id: string }>(
        `INSERT INTO invoice (org_id, buyer_id, source_system, external_ref, source_hash,
                              invoice_number, invoice_date, due_date, amount_paise,
                              paid_paise, status, current_rung, legal_approved_at)
         VALUES ($1,$2,'TALLY_CONNECTOR',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
        [ORG_ID, buyerId, `tally-${inv.no}`, `hash-${inv.no}`, inv.no, invoiceDate,
         dueDate, inv.amount.toString(), (inv.paid ?? 0n).toString(),
         inv.status ?? "OPEN", inv.rung,
         inv.legalApproved ? new Date(Date.now() - 5 * 864e5) : null]);
      const invoiceId = rows[0]!.id;

      for (let r = 1; r <= inv.rung; r++) {
        await c.query(
          `INSERT INTO ladder_event (org_id, invoice_id, from_rung, to_rung, reason, occurred_at)
           VALUES ($1,$2,$3,$4,$5, now() - ($6 || ' days')::interval)`,
          [ORG_ID, invoiceId, r - 1, r, r >= 5 ? "owner_approved" : "due_date_passed",
           String((inv.rung - r) * 7 + 2)]);
        await c.query(
          `INSERT INTO message_log (org_id, invoice_id, rung, template_name, language,
                                    body_rendered, status, cost_paise, idempotency_key,
                                    sent_at, payment_link)
           VALUES ($1,$2,$3,$4,$5,$6,'DELIVERED',14,$7, now() - ($8||' days')::interval,$9)`,
          [ORG_ID, invoiceId, r, `bakaya_r${r}_standard_hi`, "hi",
           rungBody(r, inv.no, inv.amount),
           `${invoiceId}:${r}`, String((inv.rung - r) * 7 + 2),
           `https://rzp.io/i/demo${inv.no.slice(-4)}`]);
      }

      if (inv.promise) {
        await c.query(
          `INSERT INTO promise (org_id, invoice_id, promised_date, status, created_at_rung, created_at)
           VALUES ($1,$2,$3,$4,$5, now() - ($6||' days')::interval)`,
          [ORG_ID, invoiceId, d(inv.promise.date), inv.promise.status,
           inv.promise.rung, String(Math.abs(inv.promise.date) + 3)]);
        if (inv.promise.status === "PENDING") {
          await c.query(
            `UPDATE invoice SET ladder_paused_until = $2 WHERE id = $1`,
            [invoiceId, new Date(Date.now() + (inv.promise.date + 1) * 864e5)]);
        }
      }

      if (inv.dispute) {
        await c.query(
          `INSERT INTO dispute (org_id, invoice_id, reason, status, raised_at)
           VALUES ($1,$2,$3,'OPEN', now() - interval '5 days')`,
          [ORG_ID, invoiceId, inv.dispute]);
      }

      if (inv.paid && inv.paid > 0n) {
        await c.query(
          `INSERT INTO payment (org_id, invoice_id, amount_paise, paid_at, method,
                                provider_ref, attributed)
           VALUES ($1,$2,$3, now() - ($4||' days')::interval, 'razorpay_link', $5, true)`,
          [ORG_ID, invoiceId, inv.paid.toString(),
           String(Math.floor(Math.random() * 20) + 1), `pay_demo_${inv.no.slice(-4)}`]);
      }
    }

    for (const m of INBOUND) {
      const buyerId = buyerIds.get(m.buyer)!;
      const { rows } = await c.query<{ id: string }>(
        `SELECT id FROM buyer_contact WHERE buyer_id = $1 LIMIT 1`, [buyerId]);
      await c.query(
        `INSERT INTO inbound_message (org_id, buyer_contact_id, wa_message_id, from_e164,
                                      body, raw_payload, intent, confidence, extracted,
                                      classified_at, needs_human, received_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now(), $10, now() - ($11||' days')::interval)`,
        [ORG_ID, rows[0]!.id, `wamid.demo.${Math.random().toString(36).slice(2)}`,
         BUYERS.find((b) => b.name === m.buyer)!.phone, m.body,
         JSON.stringify({ seed: true }), m.intent, m.conf,
         JSON.stringify(m.extracted), m.human, String(m.daysAgo)]);
    }

    await c.query(
      `INSERT INTO sync_run (org_id, source, status, invoices_seen, invoices_new,
                             invoices_updated, started_at, finished_at)
       VALUES ($1,'TALLY_CONNECTOR','SUCCESS',$2,0,3,
               now() - interval '2 hours', now() - interval '2 hours' + interval '41 seconds')`,
      [ORG_ID, INVOICES.length]);

    await c.query("COMMIT");
    console.log(`Seeded org ${ORG_ID}: ${BUYERS.length} buyers, ${INVOICES.length} invoices, ${INBOUND.length} replies.`);
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
    await pool.end();
  }
}

function rungBody(rung: number, no: string, amount: bigint): string {
  const rs = `₹${(amount / 100n).toLocaleString("en-IN")}`;
  const bodies: Record<number, string> = {
    1: `Namaste ji, invoice ${no} (${rs}) ki due date paas aa rahi hai. Copy aur payment link neeche hai.`,
    2: `Namaste ji, invoice ${no} (${rs}) aaj due hai. Payment link: https://rzp.io/i/demo`,
    3: `Namaste ji, invoice ${no} (${rs}) ka payment abhi tak nahi aaya. Kab tak ho payega, bata dijiye?`,
    4: `Namaste ji, invoice ${no} (${rs}) kaafi din se overdue hai. Ek committed date chahiye. Agar payment ho chuka hai to UTR bhej dijiye.`,
    5: `Namaste ji, invoice ${no} (${rs}) 45 din se zyada overdue hai. Section 43B(h) ke tehat intimation letter attach hai.`,
    6: `Namaste ji, invoice ${no} (${rs}) par MSMED Act Section 16 ke tehat interest claim attach hai.`,
  };
  return bodies[rung] ?? "";
}

main().catch((e) => { console.error(e); process.exit(1); });
