import { getKpis, getOrg } from "@bakaya/db/queries";
import { AppShell } from "../nav";
import { Kpi, PageHead } from "@/components/Shell";
import { inr, inrShort } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * The CA multi-client view. Distribution, not a feature: ~4 lakh practising CAs, each with
 * 50-200 MSME clients, and an MSME owner believes their CA rather than a sales call.
 * A CA managing 20 clients through 20 separate logins quietly stops — so this exists early.
 * See docs/11-pricing-gtm.md §3.
 */
const CLIENTS = [
  { name: "Arora Precision Components", city: "Ludhiana", live: true,  outstanding: 18_42_300_00n, dsoBefore: 78, dsoNow: 54, recovered: 7_46_100_00n, pending43b: 2 },
  { name: "Sandhu Forgings Pvt Ltd",    city: "Ludhiana", live: true,  outstanding: 31_18_000_00n, dsoBefore: 91, dsoNow: 67, recovered: 11_20_000_00n, pending43b: 4 },
  { name: "Kalsi Rubber Industries",    city: "Ludhiana", live: true,  outstanding:  9_74_500_00n, dsoBefore: 64, dsoNow: 49, recovered:  3_10_800_00n, pending43b: 1 },
  { name: "Bhatia Steel Traders",       city: "Mandi Gobindgarh", live: true, outstanding: 22_05_900_00n, dsoBefore: 85, dsoNow: 71, recovered: 5_92_400_00n, pending43b: 3 },
  { name: "New Era Fasteners",          city: "Ludhiana", live: false, outstanding: 0n, dsoBefore: 0, dsoNow: 0, recovered: 0n, pending43b: 0 },
];

const COMMISSION_PCT = 25;

export default async function CaPortalPage() {
  const [org, kpis] = await Promise.all([getOrg(), getKpis()]);
  const live = CLIENTS.filter((c) => c.live);
  const totalOutstanding = live.reduce((s, c) => s + c.outstanding, 0n);
  const totalRecovered = live.reduce((s, c) => s + c.recovered, 0n);
  const monthlyCommission = BigInt(live.length) * 1500_00n * BigInt(COMMISSION_PCT) / 100n * 4n;
  const avgDsoCut = Math.round(
    live.reduce((s, c) => s + (c.dsoBefore - c.dsoNow), 0) / live.length,
  );

  return (
    <AppShell current="/ca">
      <PageHead
        title="CA portal"
        sub="Sharma & Associates, Chartered Accountants · Ludhiana"
        actions={<><button className="btn">Commission statement</button>
                   <button className="btn btn-primary">Add a client</button></>}
      />

      <div className="grid g4" style={{ marginBottom: 16 }}>
        <Kpi label="Clients live" value={`${live.length} of ${CLIENTS.length}`}
             note="one onboarding pending" />
        <Kpi label="Across your book" value={inrShort(totalOutstanding)} note="outstanding" />
        <Kpi label="Recovered" value={inrShort(totalRecovered)} note="last 90 days" tone="up" />
        <Kpi label="Your commission" value={inr(monthlyCommission)}
             note={`${COMMISSION_PCT}% recurring · monthly`} tone="up" />
      </div>

      <div className="banner banner-accent">
        <span>◷</span>
        <div>
          Average DSO across your live clients is down <strong>{avgDsoCut} days</strong>.
          43B(h) is a rule you have been telling clients about since FY 2023-24 — this is
          the first time they can actually act on it without drafting the letter themselves.
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <h2 className="card-title">Your clients</h2>
          <span className="dimmer">you never lose visibility — and we never go around you</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Client</th><th className="num">Outstanding</th><th className="num">DSO before</th>
              <th className="num">DSO now</th><th className="num">Recovered</th>
              <th className="num">43B(h) pending</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {CLIENTS.map((c) => (
              <tr key={c.name}>
                <td className="strong">{c.name}<div className="dimmer">{c.city}</div></td>
                <td className="num strong">{c.live ? inr(c.outstanding) : "—"}</td>
                <td className="num dim">{c.live ? `${c.dsoBefore}d` : "—"}</td>
                <td className="num">{c.live
                  ? <span className="strong" style={{ color: "var(--ok)" }}>{c.dsoNow}d</span>
                  : "—"}</td>
                <td className="num" style={c.live ? { color: "var(--ok)" } : {}}>
                  {c.live ? inr(c.recovered) : "—"}</td>
                <td className="num">{c.pending43b > 0
                  ? <span className="pill pill-warn">{c.pending43b}</span>
                  : <span className="dimmer">0</span>}</td>
                <td>{c.live
                  ? <span className="pill pill-ok"><span className="dot" />live</span>
                  : <span className="pill pill-muted">onboarding</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid g2" style={{ alignItems: "start" }}>
        <div className="card">
          <div className="card-head"><h2 className="card-title">Commission</h2></div>
          <div className="card-body">
            <dl className="kv">
              <dt>Model</dt><dd>Referral — {COMMISSION_PCT}% recurring, lifetime of the account</dd>
              <dt>This month</dt><dd>{inr(monthlyCommission)}</dd>
              <dt>Paid on</dt><dd>7th of every month, by NEFT</dd>
              <dt>Last payment</dt><dd>{inr(monthlyCommission)} · 7 Sep 2026</dd>
            </dl>
            <div className="hint" style={{ marginTop: 12 }}>
              Paid on time, every month, visibly. One late payment ends a CA relationship
              permanently — and CAs talk to each other.
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h2 className="card-title">Other models available</h2></div>
          <div className="card-body">
            <dl className="kv">
              <dt>White-label</dt><dd>₹1,500/client/mo flat — you set your client&apos;s price</dd>
              <dt>Managed</dt><dd>₹999/client/mo — you run collections as a service line</dd>
            </dl>
            <div className="hint" style={{ marginTop: 12 }}>
              Currently on <strong>Referral</strong>. Switching applies from the next billing
              cycle and never changes what your existing clients pay.
            </div>
          </div>
        </div>
      </div>
      <p className="page-sub" style={{ marginTop: 14 }}>
        Client figures on this page are illustrative sample data for the demo, except{" "}
        <strong>{org.legal_name}</strong>, which reads live from the database
        ({kpis.openInvoices} open invoices).
      </p>
    </AppShell>
  );
}
