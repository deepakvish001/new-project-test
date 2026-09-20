import { listInvoices } from "@bakaya/db/queries";
import { AppShell } from "../nav";
import { PageHead, RungBadge, StatusPill } from "@/components/Shell";
import { inr, RUNG_NAMES, shortDate } from "@/lib/format";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function InvoicesPage({
  searchParams,
}: { searchParams: Promise<{ filter?: string }> }) {
  const { filter = "open" } = await searchParams;
  const invoices = await listInvoices(
    filter === "overdue90" ? { bucket: "overdue90" }
      : filter === "all" ? {}
      : { status: "open" },
  );
  const total = invoices.reduce((s, i) => s + (i.amount_paise - i.paid_paise), 0n);

  const tabs = [
    { key: "open", label: "Open" },
    { key: "overdue90", label: "90+ days" },
    { key: "all", label: "All" },
  ];

  return (
    <AppShell current="/invoices">
      <PageHead
        title="Invoices"
        sub={`${invoices.length} invoices · ${inr(total)} outstanding`}
        actions={<><button className="btn">Filter</button><button className="btn">Export CSV</button></>}
      />
      <div className="tabs">
        {tabs.map((t) => (
          <Link key={t.key} href={`/invoices?filter=${t.key}`}
                className={`tab${filter === t.key ? " active" : ""}`}>{t.label}</Link>
        ))}
      </div>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Invoice</th><th>Buyer</th><th className="num">Amount</th>
              <th className="num">Outstanding</th><th className="num">Due</th>
              <th className="num">Overdue</th><th>Rung</th><th>Status</th><th>Ladder</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((i) => {
              const paused = i.ladder_paused_until && new Date(i.ladder_paused_until) > new Date();
              return (
                <tr key={i.id}>
                  <td>
                    <Link href={`/invoices/${i.id}`} className="mono strong">{i.invoice_number}</Link>
                    <div className="dimmer">{shortDate(i.invoice_date)}</div>
                  </td>
                  <td>{i.buyer_name}
                    <div className="dimmer">{i.contact_name}</div></td>
                  <td className="num dim">{inr(i.amount_paise)}</td>
                  <td className="num strong">{inr(i.amount_paise - i.paid_paise)}</td>
                  <td className="num dim">{shortDate(i.due_date)}</td>
                  <td className="num">
                    {i.days_overdue > 0
                      ? <span className={i.days_overdue > 45 ? "strong" : ""}
                              style={i.days_overdue > 45 ? { color: "var(--danger)" } : {}}>
                          {i.days_overdue}d</span>
                      : <span className="dimmer">not due</span>}
                  </td>
                  <td><RungBadge rung={i.current_rung} /></td>
                  <td><StatusPill status={i.status} /></td>
                  <td>
                    {i.has_dispute ? <span className="pill pill-danger">stopped · dispute</span>
                      : paused ? <span className="pill pill-warn">paused · promise</span>
                      : i.status === "PAID" ? <span className="pill pill-ok">closed</span>
                      : i.current_rung >= 4 && !i.legal_approved_at
                        ? <span className="pill pill-accent">needs approval</span>
                      : <span className="pill pill-muted">{RUNG_NAMES[i.current_rung]}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
