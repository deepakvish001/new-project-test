import { getAgeing, getKpis, listInvoices } from "@bakaya/db/queries";
import { AppShell } from "./nav";
import { Kpi, PageHead, RungBadge } from "@/components/Shell";
import { inr, inrShort, relTime, RUNG_NAMES, shortDate } from "@/lib/format";
import Link from "next/link";

export const dynamic = "force-dynamic";

const BUCKET_COLOUR: Record<string, string> = {
  "Not due": "var(--text-3)",
  "1-30 days": "var(--accent)",
  "31-45 days": "var(--accent)",
  "46-60 days": "var(--warn)",
  "61-90 days": "var(--warn)",
  "90+ days": "var(--danger)",
};

export default async function DashboardPage() {
  const [kpis, ageing, invoices] = await Promise.all([
    getKpis(), getAgeing(), listInvoices({ status: "open" }),
  ]);
  const max = ageing.reduce((m, b) => (b.paise > m ? b.paise : m), 1n);
  const attention = invoices
    .filter((i) => i.has_dispute || i.promise_status === "BROKEN" || i.days_overdue > 60)
    .slice(0, 6);
  const staleHours = kpis.lastSyncAt
    ? Math.round((Date.now() - new Date(kpis.lastSyncAt).getTime()) / 3.6e6)
    : null;

  return (
    <AppShell current="/">
      <PageHead
        title="Dashboard"
        sub={`Tally synced ${relTime(kpis.lastSyncAt)} · ${kpis.openInvoices} open invoices across ${kpis.buyers} buyers`}
        actions={<><button className="btn">Export</button><button className="btn btn-primary">Sync Tally now</button></>}
      />

      {staleHours !== null && staleHours >= 48 ? (
        <div className="banner banner-warn">
          <span>⚠</span>
          <div><strong>Sync is {staleHours}h stale.</strong> The ladder is paused for this org — dunning an invoice that was already paid in Tally is worse than sending nothing.</div>
        </div>
      ) : null}

      <div className="grid g4" style={{ marginBottom: 16 }}>
        <Kpi label="Outstanding" value={inrShort(kpis.outstandingPaise)}
             note={`${kpis.openInvoices} invoices`} />
        <Kpi label="90+ days" value={inrShort(kpis.overdue90Paise)}
             note="the bucket that pays for this" tone="down" />
        <Kpi label="Collected · 30d" value={inrShort(kpis.collected30Paise)}
             note="attributed to Bakaya" tone="up" />
        <Kpi label="Average DSO" value={`${kpis.dsoDays} days`}
             note="invoice date to payment" />
      </div>

      <div className="grid g2" style={{ marginBottom: 16, alignItems: "start" }}>
        <div className="card">
          <div className="card-head">
            <h2 className="card-title">Ageing</h2>
            <span className="dimmer">outstanding by bucket</span>
          </div>
          <div className="card-body">
            {ageing.map((b) => (
              <div className="ageing-row" key={b.label}>
                <div className="ageing-label">{b.label}</div>
                <div className="ageing-track">
                  <div className="ageing-fill" style={{
                    width: `${Number((b.paise * 100n) / max)}%`,
                    background: BUCKET_COLOUR[b.label],
                  }} />
                </div>
                <div className="ageing-val">{inrShort(b.paise)}</div>
                <div className="ageing-n">{b.count}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h2 className="card-title">Tonight&apos;s digest</h2>
            <span className="dimmer">19:00 IST · WhatsApp</span>
          </div>
          <div className="card-body">
            <div className="chat out" style={{ maxWidth: "100%" }}>
{`Namaste Deepak ji, aaj ka update:

✅ Aaya: ${inr(kpis.collected30Paise / 6n)} (2 invoices)
📅 Vaada mila: ${inr(kpis.promisedPaise)} — 2 buyers
⚠️ Aapko dekhna hai:
   · ${kpis.needsHuman} reply jinpe decision chahiye
   · ${kpis.awaitingApproval} invoice 43B(h) ke liye ready

43B(h) bhejun? Reply 1 = haan`}
            </div>
            <div className="chat-meta">
              Reply-to-approve. The owner never has to open a dashboard to run the system.
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2 className="card-title">Needs your attention</h2>
          <Link href="/invoices" className="dimmer">View all invoices →</Link>
        </div>
        <table>
          <thead>
            <tr>
              <th>Invoice</th><th>Buyer</th><th className="num">Outstanding</th>
              <th className="num">Overdue</th><th>Rung</th><th>Why</th>
            </tr>
          </thead>
          <tbody>
            {attention.map((i) => (
              <tr key={i.id}>
                <td><Link href={`/invoices/${i.id}`} className="mono strong">{i.invoice_number}</Link>
                  <div className="dimmer">due {shortDate(i.due_date)}</div></td>
                <td>{i.buyer_name}</td>
                <td className="num strong">{inr(i.amount_paise - i.paid_paise)}</td>
                <td className="num">{i.days_overdue > 0 ? `${i.days_overdue}d` : "—"}</td>
                <td><RungBadge rung={i.current_rung} />
                  <div className="dimmer">{RUNG_NAMES[i.current_rung]}</div></td>
                <td>
                  {i.has_dispute ? <span className="pill pill-danger">dispute open</span>
                    : i.promise_status === "BROKEN" ? <span className="pill pill-warn">promise broken</span>
                    : <span className="pill pill-muted">{i.days_overdue}d overdue</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
