import { withOrg } from "./client";

export const DEMO_ORG_ID = "11111111-1111-1111-1111-111111111111";

const num = (v: unknown): bigint => BigInt(String(v ?? "0"));

export interface Org {
  id: string; legal_name: string; trade_name: string | null; gstin: string | null;
  udyam_number: string | null; plan: string; default_language: string;
  address: { city?: string; state?: string };
}

export async function getOrg(orgId = DEMO_ORG_ID): Promise<Org> {
  return withOrg(orgId, async (q) => {
    const rows = await q<Org>(`SELECT * FROM org WHERE id = $1`, [orgId]);
    if (!rows[0]) throw new Error(`Org ${orgId} not found — run ./scripts/dev-db.sh`);
    return rows[0];
  });
}

export interface Kpis {
  outstandingPaise: bigint; overdue90Paise: bigint; collected30Paise: bigint;
  promisedPaise: bigint; openInvoices: number; dsoDays: number;
  needsHuman: number; awaitingApproval: number; buyers: number;
  lastSyncAt: Date | null;
}

export async function getKpis(orgId = DEMO_ORG_ID): Promise<Kpis> {
  return withOrg(orgId, async (q) => {
    const [agg] = await q<Record<string, unknown>>(`
      SELECT
        COALESCE(SUM(amount_paise - paid_paise) FILTER (WHERE status <> 'PAID'),0) AS outstanding,
        COALESCE(SUM(amount_paise - paid_paise) FILTER (
          WHERE status <> 'PAID' AND due_date < CURRENT_DATE - 90),0) AS overdue90,
        COUNT(*) FILTER (WHERE status <> 'PAID') AS open_invoices,
        COALESCE(AVG(CURRENT_DATE - due_date) FILTER (WHERE status <> 'PAID'),0) AS avg_overdue
      FROM invoice`);
    const [paid] = await q<Record<string, unknown>>(`
      SELECT COALESCE(SUM(amount_paise),0) AS collected
      FROM payment WHERE paid_at > now() - interval '30 days'`);
    const [prom] = await q<Record<string, unknown>>(`
      SELECT COALESCE(SUM(i.amount_paise - i.paid_paise),0) AS promised
      FROM promise p JOIN invoice i ON i.id = p.invoice_id
      WHERE p.status = 'PENDING' AND p.promised_date >= CURRENT_DATE`);
    const [counts] = await q<Record<string, unknown>>(`
      SELECT
        (SELECT COUNT(*) FROM inbound_message WHERE needs_human) AS needs_human,
        (SELECT COUNT(*) FROM invoice
           WHERE status <> 'PAID' AND current_rung >= 4
             AND legal_approved_at IS NULL
             AND due_date < CURRENT_DATE - 30) AS awaiting_approval,
        (SELECT COUNT(*) FROM buyer) AS buyers,
        (SELECT MAX(finished_at) FROM sync_run WHERE status = 'SUCCESS') AS last_sync`);
    const [dso] = await q<Record<string, unknown>>(`
      SELECT COALESCE(AVG(p.paid_at::date - i.invoice_date),0) AS dso
      FROM payment p JOIN invoice i ON i.id = p.invoice_id`);

    return {
      outstandingPaise: num(agg?.["outstanding"]),
      overdue90Paise: num(agg?.["overdue90"]),
      collected30Paise: num(paid?.["collected"]),
      promisedPaise: num(prom?.["promised"]),
      openInvoices: Number(agg?.["open_invoices"] ?? 0),
      dsoDays: Math.round(Number(dso?.["dso"] ?? 0)),
      needsHuman: Number(counts?.["needs_human"] ?? 0),
      awaitingApproval: Number(counts?.["awaiting_approval"] ?? 0),
      buyers: Number(counts?.["buyers"] ?? 0),
      lastSyncAt: (counts?.["last_sync"] as Date | null) ?? null,
    };
  });
}

export interface AgeingBucket { label: string; paise: bigint; count: number }

export async function getAgeing(orgId = DEMO_ORG_ID): Promise<AgeingBucket[]> {
  return withOrg(orgId, async (q) => {
    const rows = await q<Record<string, unknown>>(`
      SELECT bucket, SUM(amount_paise - paid_paise) AS paise, COUNT(*) AS n FROM (
        SELECT CASE
          WHEN CURRENT_DATE - due_date <  0  THEN 'Not due'
          WHEN CURRENT_DATE - due_date <= 30 THEN '1-30 days'
          WHEN CURRENT_DATE - due_date <= 45 THEN '31-45 days'
          WHEN CURRENT_DATE - due_date <= 60 THEN '46-60 days'
          WHEN CURRENT_DATE - due_date <= 90 THEN '61-90 days'
          ELSE '90+ days' END AS bucket, amount_paise, paid_paise
        FROM invoice WHERE status <> 'PAID') t
      GROUP BY bucket`);
    const order = ["Not due", "1-30 days", "31-45 days", "46-60 days", "61-90 days", "90+ days"];
    return order.map((label) => {
      const r = rows.find((x) => x["bucket"] === label);
      return { label, paise: num(r?.["paise"]), count: Number(r?.["n"] ?? 0) };
    });
  });
}

export interface InvoiceRow {
  id: string; invoice_number: string; invoice_date: string; due_date: string;
  amount_paise: bigint; paid_paise: bigint; status: string; current_rung: number;
  buyer_name: string; buyer_id: string; days_overdue: number;
  ladder_paused_until: Date | null; legal_approved_at: Date | null;
  promised_date: string | null; promise_status: string | null;
  has_dispute: boolean; preferred_language: string | null;
  max_rung_override: number | null; buyer_paused: boolean;
  contact_name: string | null; contact_phone: string | null;
  opted_out_at: Date | null;
}

const INVOICE_SELECT = `
  SELECT i.id, i.invoice_number, i.invoice_date::text, i.due_date::text,
         i.amount_paise, i.paid_paise, i.status, i.current_rung,
         i.ladder_paused_until, i.legal_approved_at,
         b.legal_name AS buyer_name, b.id AS buyer_id, b.preferred_language,
         b.max_rung_override, b.is_paused AS buyer_paused,
         (CURRENT_DATE - i.due_date) AS days_overdue,
         p.promised_date::text AS promised_date, p.status::text AS promise_status,
         EXISTS (SELECT 1 FROM dispute dd
                  WHERE dd.invoice_id = i.id AND dd.status = 'OPEN') AS has_dispute,
         c.name AS contact_name, c.whatsapp_e164 AS contact_phone, c.opted_out_at
  FROM invoice i
  JOIN buyer b ON b.id = i.buyer_id
  LEFT JOIN LATERAL (
    SELECT promised_date, status FROM promise
    WHERE invoice_id = i.id ORDER BY created_at DESC LIMIT 1) p ON true
  LEFT JOIN LATERAL (
    SELECT name, whatsapp_e164, opted_out_at FROM buyer_contact
    WHERE buyer_id = b.id AND is_active ORDER BY is_primary DESC LIMIT 1) c ON true`;

function mapInvoice(r: Record<string, unknown>): InvoiceRow {
  return {
    ...(r as unknown as InvoiceRow),
    amount_paise: num(r["amount_paise"]),
    paid_paise: num(r["paid_paise"]),
    days_overdue: Number(r["days_overdue"] ?? 0),
    current_rung: Number(r["current_rung"] ?? 0),
  };
}

export async function listInvoices(
  opts: { status?: string; bucket?: string } = {},
  orgId = DEMO_ORG_ID,
): Promise<InvoiceRow[]> {
  return withOrg(orgId, async (q) => {
    const where: string[] = [];
    const params: unknown[] = [];
    if (opts.status === "open") where.push(`i.status <> 'PAID'`);
    else if (opts.status) { params.push(opts.status.toUpperCase()); where.push(`i.status = $${params.length}`); }
    if (opts.bucket === "overdue90") where.push(`i.due_date < CURRENT_DATE - 90 AND i.status <> 'PAID'`);
    const sql = `${INVOICE_SELECT} ${where.length ? "WHERE " + where.join(" AND ") : ""}
                 ORDER BY (CURRENT_DATE - i.due_date) DESC, i.amount_paise DESC`;
    return (await q<Record<string, unknown>>(sql, params)).map(mapInvoice);
  });
}

export async function getInvoice(id: string, orgId = DEMO_ORG_ID): Promise<InvoiceRow | null> {
  return withOrg(orgId, async (q) => {
    const rows = await q<Record<string, unknown>>(`${INVOICE_SELECT} WHERE i.id = $1`, [id]);
    return rows[0] ? mapInvoice(rows[0]) : null;
  });
}

export interface TimelineEntry {
  kind: "message" | "event" | "inbound" | "payment" | "promise" | "dispute";
  at: Date; title: string; body: string | null; meta: string | null;
}

export async function getInvoiceTimeline(
  invoiceId: string, orgId = DEMO_ORG_ID,
): Promise<TimelineEntry[]> {
  return withOrg(orgId, async (q) => {
    const rows = await q<Record<string, unknown>>(`
      SELECT 'message' AS kind, sent_at AS at,
             'Rung ' || rung || ' sent · ' || template_name AS title,
             body_rendered AS body, status::text AS meta
        FROM message_log WHERE invoice_id = $1 AND sent_at IS NOT NULL
      UNION ALL
      SELECT 'event', occurred_at, 'Ladder ' || from_rung || ' -> ' || to_rung,
             reason, decided_by FROM ladder_event WHERE invoice_id = $1
      UNION ALL
      SELECT 'payment', paid_at, 'Payment received', method, provider_ref
        FROM payment WHERE invoice_id = $1
      UNION ALL
      SELECT 'promise', created_at, 'Promise to pay · ' || promised_date::text,
             status::text, NULL FROM promise WHERE invoice_id = $1
      UNION ALL
      SELECT 'dispute', raised_at, 'Dispute raised', reason, status::text
        FROM dispute WHERE invoice_id = $1
      ORDER BY at DESC`, [invoiceId]);
    return rows as unknown as TimelineEntry[];
  });
}

export interface BuyerRow {
  id: string; legal_name: string; gstin: string | null; city: string | null;
  preferred_language: string | null; is_paused: boolean; max_rung_override: number | null;
  outstanding_paise: bigint; open_count: number; worst_days: number;
  broken_promises: number; contact_name: string | null; contact_phone: string | null;
}

export async function listBuyers(orgId = DEMO_ORG_ID): Promise<BuyerRow[]> {
  return withOrg(orgId, async (q) => {
    const rows = await q<Record<string, unknown>>(`
      SELECT b.id, b.legal_name, b.gstin, b.address->>'city' AS city,
             b.preferred_language, b.is_paused, b.max_rung_override,
             COALESCE(SUM(i.amount_paise - i.paid_paise)
                      FILTER (WHERE i.status <> 'PAID'),0) AS outstanding_paise,
             COUNT(i.id) FILTER (WHERE i.status <> 'PAID') AS open_count,
             COALESCE(MAX(CURRENT_DATE - i.due_date)
                      FILTER (WHERE i.status <> 'PAID'),0) AS worst_days,
             (SELECT COUNT(*) FROM promise p JOIN invoice ii ON ii.id = p.invoice_id
               WHERE ii.buyer_id = b.id AND p.status = 'BROKEN') AS broken_promises,
             c.name AS contact_name, c.whatsapp_e164 AS contact_phone
      FROM buyer b
      LEFT JOIN invoice i ON i.buyer_id = b.id
      LEFT JOIN LATERAL (SELECT name, whatsapp_e164 FROM buyer_contact
                          WHERE buyer_id = b.id ORDER BY is_primary DESC LIMIT 1) c ON true
      GROUP BY b.id, c.name, c.whatsapp_e164
      ORDER BY outstanding_paise DESC`);
    return rows.map((r) => ({
      ...(r as unknown as BuyerRow),
      outstanding_paise: num(r["outstanding_paise"]),
      open_count: Number(r["open_count"] ?? 0),
      worst_days: Number(r["worst_days"] ?? 0),
      broken_promises: Number(r["broken_promises"] ?? 0),
    }));
  });
}

export interface InboxRow {
  id: string; body: string; intent: string; confidence: number;
  extracted: Record<string, unknown>; needs_human: boolean; received_at: Date;
  buyer_name: string; buyer_id: string; contact_name: string | null; from_e164: string;
}

export async function listInbox(orgId = DEMO_ORG_ID): Promise<InboxRow[]> {
  return withOrg(orgId, async (q) => {
    const rows = await q<Record<string, unknown>>(`
      SELECT m.id, m.body, m.intent::text AS intent, m.confidence, m.extracted,
             m.needs_human, m.received_at, m.from_e164,
             b.legal_name AS buyer_name, b.id AS buyer_id, c.name AS contact_name
      FROM inbound_message m
      LEFT JOIN buyer_contact c ON c.id = m.buyer_contact_id
      LEFT JOIN buyer b ON b.id = c.buyer_id
      ORDER BY m.needs_human DESC, m.received_at DESC`);
    return rows.map((r) => ({
      ...(r as unknown as InboxRow),
      confidence: Number(r["confidence"] ?? 0),
    }));
  });
}

export interface PolicyRow {
  tone: string; rung_offsets_days: number[]; max_auto_rung: number;
  quiet_start_hour_ist: number; quiet_end_hour_ist: number; send_on_weekends: boolean;
  min_invoice_paise: bigint; pause_on_hostile: boolean; digest_hour_ist: number;
}

export async function getPolicy(orgId = DEMO_ORG_ID): Promise<PolicyRow> {
  return withOrg(orgId, async (q) => {
    const rows = await q<Record<string, unknown>>(`SELECT * FROM org_policy`);
    const r = rows[0];
    if (!r) throw new Error("No org_policy row — run ./scripts/dev-db.sh");
    return { ...(r as unknown as PolicyRow), min_invoice_paise: num(r["min_invoice_paise"]) };
  });
}
