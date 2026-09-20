import { getKpis, getOrg } from "@bakaya/db/queries";
import { AppShell } from "../nav";
import { PageHead } from "@/components/Shell";
import { relTime } from "@/lib/format";

export const dynamic = "force-dynamic";

const STEPS = [
  { done: true, title: "Account created", body: "Arora Precision Components Pvt Ltd · Udyam verified", time: "74 days ago" },
  { done: true, title: "Invoices imported", body: "Bills Receivable export from Tally Prime · 22 invoices, 12 buyers", time: "74 days ago" },
  { done: true, title: "Buyers reviewed and merged", body: "3 duplicate ledger names merged. Two protected buyers marked 'never escalate'.", time: "73 days ago" },
  { done: true, title: "Tone and language set", body: "Standard tone · Hindi default, Punjabi for 4 buyers", time: "73 days ago" },
  { done: true, title: "Supervised pilot on 10 invoices", body: "First collection attributed on day 6.", time: "68 days ago" },
  { done: false, title: "Install the Tally connector", body: "Upgrade from manual uploads to an hourly automatic sync.", time: null },
];

export default async function OnboardingPage() {
  const [org, kpis] = await Promise.all([getOrg(), getKpis()]);
  return (
    <AppShell current="/onboarding">
      <PageHead
        title="Import data"
        sub={`Last sync ${relTime(kpis.lastSyncAt)} · ${kpis.openInvoices} open invoices`}
      />

      <div className="grid g2" style={{ alignItems: "start", marginBottom: 16 }}>
        <div className="card">
          <div className="card-head">
            <h2 className="card-title">Upload a Tally export</h2>
            <span className="pill pill-ok">live</span>
          </div>
          <div className="card-body">
            <div className="upload-zone">
              <div style={{ fontSize: 26, marginBottom: 7 }}>↥</div>
              <div className="strong">Drop your Bills Receivable export here</div>
              <div className="hint" style={{ marginTop: 5 }}>.xlsx or .csv — the file Tally gives you, unedited</div>
              <button className="btn btn-primary" style={{ marginTop: 13 }}>Choose file</button>
            </div>
            <div className="hint" style={{ marginTop: 12 }}>
              In Tally: <span className="mono">Gateway → Display → Statements of Accounts →
              Outstandings → Receivables → Export</span>. Three clicks, and every Tally user
              already knows them. Column headers are mapped automatically on first upload,
              then remembered.
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h2 className="card-title">Connect automatically</h2>
            <span className="pill pill-warn">not installed</span>
          </div>
          <div className="card-body">
            <p className="page-sub" style={{ marginTop: 0 }}>
              A small tray app on the PC that runs Tally. It pulls every hour and pushes
              out over HTTPS — it never listens on a port, and we never dial into your
              network.
            </p>
            <div className="btn-row" style={{ marginBottom: 14 }}>
              <button className="btn btn-primary">Download connector (Windows)</button>
              <button className="btn">Setup guide</button>
            </div>
            <dl className="kv">
              <dt>Tally access</dt><dd>Read-only user, created during setup</dd>
              <dt>Direction</dt><dd>Outbound only</dd>
              <dt>Transport</dt><dd>mTLS, per-org client certificate</dd>
              <dt>If offline</dt><dd>Queues locally, backfills on reconnect</dd>
            </dl>
          </div>
        </div>
      </div>

      <div className="grid g3" style={{ marginBottom: 16 }}>
        {[
          { t: "CSV / Excel", s: "Active", p: "pill-ok", b: "Works from day one. No installer, no IT conversation." },
          { t: "Tally connector", s: "Available", p: "pill-warn", b: "Hourly automatic sync. The real product." },
          { t: "GSTR-1 import", s: "Available", p: "pill-muted", b: "For buyers without Tally. Clean GSTINs make dedupe work." },
        ].map((m) => (
          <div className="card" key={m.t}>
            <div className="card-body">
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7 }}>
                <strong>{m.t}</strong><span className={`pill ${m.p}`}>{m.s}</span>
              </div>
              <div className="page-sub">{m.b}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-head">
          <h2 className="card-title">Your setup</h2>
          <span className="dimmer">{org.legal_name}</span>
        </div>
        <div className="card-body">
          <div className="step-list">
            {STEPS.map((s) => (
              <div className="step-item" key={s.title}>
                <span className={`step-n${s.done ? " done" : " todo"}`} />
                <div style={{ flex: 1 }}>
                  <div className="strong">{s.title}</div>
                  <div className="page-sub">{s.body}</div>
                </div>
                <span className="dimmer">{s.time ?? "pending"}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
