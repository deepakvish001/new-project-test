import { listBuyers } from "@bakaya/db/queries";
import { AppShell } from "../nav";
import { PageHead } from "@/components/Shell";
import { inr, LANGUAGES } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * The risk column is the seed of the second act: once we have chased enough invoices we
 * know which buyers pay late and how late. See docs/10-roadmap.md Phase 4.
 */
function risk(worstDays: number, broken: number): { label: string; pill: string } {
  if (broken >= 2 || worstDays > 90) return { label: "High", pill: "pill-danger" };
  if (broken >= 1 || worstDays > 45) return { label: "Watch", pill: "pill-warn" };
  if (worstDays > 0) return { label: "Slow", pill: "pill-muted" };
  return { label: "Good", pill: "pill-ok" };
}

export default async function BuyersPage() {
  const buyers = await listBuyers();
  const total = buyers.reduce((s, b) => s + b.outstanding_paise, 0n);
  return (
    <AppShell current="/buyers">
      <PageHead
        title="Buyers"
        sub={`${buyers.length} buyers · ${inr(total)} outstanding`}
        actions={<button className="btn btn-primary">Add buyer</button>}
      />
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Buyer</th><th>GSTIN</th><th>Contact</th><th>Language</th>
              <th className="num">Outstanding</th><th className="num">Open</th>
              <th className="num">Worst</th><th className="num">Broken</th>
              <th>Risk</th><th>Ladder cap</th>
            </tr>
          </thead>
          <tbody>
            {buyers.map((b) => {
              const r = risk(b.worst_days, b.broken_promises);
              return (
                <tr key={b.id}>
                  <td className="strong">{b.legal_name}
                    <div className="dimmer">{b.city}</div></td>
                  <td className="mono dim">{b.gstin}</td>
                  <td>{b.contact_name}
                    <div className="dimmer mono">{b.contact_phone}</div></td>
                  <td className="dim">{LANGUAGES[b.preferred_language ?? "hi"]}</td>
                  <td className="num strong">{inr(b.outstanding_paise)}</td>
                  <td className="num dim">{b.open_count}</td>
                  <td className="num dim">{b.worst_days > 0 ? `${b.worst_days}d` : "—"}</td>
                  <td className="num">{b.broken_promises > 0
                    ? <span className="strong" style={{ color: "var(--warn)" }}>{b.broken_promises}</span>
                    : <span className="dimmer">0</span>}</td>
                  <td><span className={`pill ${r.pill}`}>{r.label}</span></td>
                  <td>{b.is_paused
                    ? <span className="pill pill-muted">paused</span>
                    : b.max_rung_override
                      ? <span className="pill pill-warn">max rung {b.max_rung_override}</span>
                      : <span className="dimmer">default</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="page-sub" style={{ marginTop: 14 }}>
        Broken promises are the strongest signal we hold. Three broken promises predicts
        default better than 60 days of silence — and this column is what eventually becomes
        a licensable buyer payment-behaviour score.
      </p>
    </AppShell>
  );
}
