import { getOrg, listInvoices } from "@bakaya/db/queries";
import { appointedDay, computeMsmedInterest, formatPaise, MSMED_RATE_MULTIPLIER,
         bankRateOn } from "@bakaya/legal";
import { dateOfInstant, istDate } from "@bakaya/ladder";
import { AppShell } from "../nav";
import { PageHead } from "@/components/Shell";
import { inr, shortDate } from "@/lib/format";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const [org, invoices] = await Promise.all([getOrg(), listInvoices({ status: "open" })]);
  const today = dateOfInstant(new Date());

  const pending = invoices
    .filter((i) => i.days_overdue > 45 && !i.legal_approved_at && !i.has_dispute)
    .map((i) => {
      const start = appointedDay(istDate(i.invoice_date), 45);
      const interest = computeMsmedInterest({
        principalPaise: i.amount_paise - i.paid_paise,
        appointedDay: start,
        asOf: today,
      });
      return { invoice: i, interest };
    });

  const totalClaim = pending.reduce((s, p) => s + p.interest.totalPaise, 0n);

  return (
    <AppShell current="/approvals">
      <PageHead
        title="Legal approvals"
        sub={`${pending.length} invoices past the MSMED 45-day limit · ${inr(totalClaim)} claimable`}
      />

      <div className="banner banner-warn">
        <span>⚖</span>
        <div>
          <strong>Nothing here sends without you.</strong> Rungs 5 and 6 are the only ones
          that never fire automatically. Letters go out on <strong>{org.legal_name}</strong>&apos;s
          letterhead, under your name, with Udyam <span className="mono">{org.udyam_number}</span> —
          Bakaya&apos;s name is not on them. Interest is computed in code, never by a model.
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <h2 className="card-title">Ready for a 43B(h) intimation</h2>
          <span className="dimmer">
            bank rate {bankRateOn(today)}% × {MSMED_RATE_MULTIPLIER} = {(bankRateOn(today) * MSMED_RATE_MULTIPLIER).toFixed(2)}% p.a., compounded monthly
          </span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Invoice</th><th>Buyer</th><th className="num">Principal</th>
              <th className="num">Overdue</th><th className="num">Appointed day</th>
              <th className="num">Interest u/s 16</th><th className="num">Total claim</th>
              <th>Approve</th>
            </tr>
          </thead>
          <tbody>
            {pending.map(({ invoice: i, interest }) => (
              <tr key={i.id}>
                <td>
                  <Link href={`/invoices/${i.id}`} className="mono strong">{i.invoice_number}</Link>
                  <div className="dimmer">raised {shortDate(i.invoice_date)}</div>
                </td>
                <td>{i.buyer_name}</td>
                <td className="num strong">{inr(i.amount_paise - i.paid_paise)}</td>
                <td className="num" style={{ color: "var(--danger)" }}>{i.days_overdue}d</td>
                <td className="num dim">{shortDate(interest.appointedDay)}</td>
                <td className="num" style={{ color: "var(--warn)" }}>
                  {formatPaise(interest.interestPaise)}
                  <div className="dimmer">
                    {interest.completedMonths} monthly rest{interest.completedMonths === 1 ? "" : "s"}
                    {interest.residualDays > 0 ? ` + ${interest.residualDays}d` : ""}
                  </div>
                </td>
                <td className="num strong">{formatPaise(interest.totalPaise)}</td>
                <td>
                  <div className="btn-row">
                    <button className="btn btn-sm btn-danger">Approve</button>
                    <button className="btn btn-sm">Preview</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pending[0] ? (
        <div className="card">
          <div className="card-head">
            <h2 className="card-title">
              Interest computation · {pending[0].invoice.invoice_number}
            </h2>
            <span className="dimmer">frozen into legal_document.computation so it can be re-derived</span>
          </div>
          <table>
            <thead>
              <tr><th>Rest</th><th className="num">From</th><th className="num">To</th>
                  <th className="num">Opening</th><th className="num">Rate</th>
                  <th className="num">Interest</th><th className="num">Closing</th></tr>
            </thead>
            <tbody>
              {pending[0].interest.schedule.map((r) => (
                <tr key={r.month}>
                  <td className="dim">{r.month}</td>
                  <td className="num dim">{shortDate(r.from)}</td>
                  <td className="num dim">{shortDate(r.to)}</td>
                  <td className="num">{formatPaise(r.openingPaise)}</td>
                  <td className="num dim">{r.ratePct.toFixed(2)}%</td>
                  <td className="num">{formatPaise(r.interestPaise)}</td>
                  <td className="num strong">{formatPaise(r.closingPaise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <p className="page-sub" style={{ marginTop: 14 }}>
        Not legal advice. Have a practising CA and a commercial lawyer review the computation
        and the letter templates before the first letter is sent — see docs/08-legal-pack.md.
      </p>
    </AppShell>
  );
}
