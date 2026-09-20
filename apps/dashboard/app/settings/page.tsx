import { getOrg, getPolicy } from "@bakaya/db/queries";
import { AppShell } from "../nav";
import { PageHead, RungBadge } from "@/components/Shell";
import { inr, RUNG_NAMES } from "@/lib/format";

export const dynamic = "force-dynamic";

function Switch({ on, label, hint }: { on: boolean; label: string; hint: string }) {
  return (
    <div className="field">
      <div className="switch">
        <span className={`switch-track${on ? " on" : ""}`}><span className="switch-knob" /></span>
        <span>{label}</span>
      </div>
      <div className="hint">{hint}</div>
    </div>
  );
}

export default async function SettingsPage() {
  const [org, policy] = await Promise.all([getOrg(), getPolicy()]);
  return (
    <AppShell current="/settings">
      <PageHead
        title="Settings"
        sub="How the ladder behaves for this org"
        actions={<><button className="btn">Discard</button><button className="btn btn-primary">Save changes</button></>}
      />

      <div className="grid g2" style={{ alignItems: "start" }}>
        <div style={{ display: "grid", gap: 14 }}>
          <div className="card">
            <div className="card-head"><h2 className="card-title">Escalation ladder</h2></div>
            <div className="card-body">
              <div className="rung-ladder">
                {[1, 2, 3, 4, 5, 6].map((r) => {
                  const off = policy.rung_offsets_days[r - 1];
                  const legal = r > policy.max_auto_rung;
                  return (
                    <div key={r} className={`rung-step${legal ? " locked" : ""}`}>
                      <RungBadge rung={r} />
                      <input type="text" defaultValue={off === null ? "off" : off < 0 ? `D${off}` : `D+${off}`}
                             style={{ width: 62 }} className="mono" />
                      <span style={{ flex: 1 }}>{RUNG_NAMES[r]}</span>
                      {legal
                        ? <span className="pill pill-danger">approval required</span>
                        : <span className="pill pill-muted">automatic</span>}
                    </div>
                  );
                })}
              </div>
              <div className="hint" style={{ marginTop: 11 }}>
                Rungs above {policy.max_auto_rung} are legal rungs. They can never be made
                automatic — the approval gate is enforced in the engine, in org_policy, and
                by a NOT NULL constraint on the document row. One rule stated three times,
                because a rule stated once is a rule you eventually break.
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-head"><h2 className="card-title">Tone</h2></div>
            <div className="card-body">
              <div className="field">
                <label>Message tone</label>
                <select defaultValue={policy.tone}>
                  <option value="GENTLE">Gentle — for buyers you cannot afford to annoy</option>
                  <option value="STANDARD">Standard</option>
                  <option value="FIRM">Firm — names the amount and days overdue early</option>
                </select>
                <div className="hint">
                  Per-buyer overrides beat this. A dominant OEM can be capped at rung 3
                  from the buyer&apos;s own page.
                </div>
              </div>
              <div className="field">
                <label>Default language</label>
                <select defaultValue={org.default_language}>
                  <option value="hi">Hindi</option><option value="pa">Punjabi</option>
                  <option value="gu">Gujarati</option><option value="mr">Marathi</option>
                  <option value="ta">Tamil</option><option value="en">English</option>
                </select>
                <div className="hint">Buyers with a preferred language always get theirs.</div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gap: 14 }}>
          <div className="card">
            <div className="card-head"><h2 className="card-title">Sending window</h2></div>
            <div className="card-body">
              <div className="grid g2">
                <div className="field">
                  <label>Quiet hours start (IST)</label>
                  <input type="number" defaultValue={policy.quiet_start_hour_ist} />
                </div>
                <div className="field">
                  <label>Quiet hours end (IST)</label>
                  <input type="number" defaultValue={policy.quiet_end_hour_ist} />
                </div>
              </div>
              <Switch on={policy.send_on_weekends} label="Send on weekends"
                      hint="Off by default. A Sunday dunning message reads as desperation." />
              <div className="field">
                <label>Minimum invoice value</label>
                <input type="text" defaultValue={inr(policy.min_invoice_paise)} />
                <div className="hint">Below this we never spend a message.</div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-head"><h2 className="card-title">Safety</h2></div>
            <div className="card-body">
              <Switch on={policy.pause_on_hostile} label="Stop the ladder on a hostile reply"
                      hint="Strongly recommended. One damaged buyer relationship ends the account." />
              <Switch on label="Never dun a disputed invoice"
                      hint="Enforced in the engine. Cannot be turned off." />
              <Switch on label="Honour STOP instantly"
                      hint="A WhatsApp policy obligation, not a preference. Cannot be turned off." />
              <Switch on label="Pause everything if Tally sync is over 48h stale"
                      hint="Silence is always safer than dunning a buyer who already paid." />
            </div>
          </div>

          <div className="card">
            <div className="card-head"><h2 className="card-title">Daily digest</h2></div>
            <div className="card-body">
              <div className="field">
                <label>Send at (IST)</label>
                <input type="number" defaultValue={policy.digest_hour_ist} />
                <div className="hint">
                  One WhatsApp message a day. Reply-to-approve — the owner should never need
                  to open this dashboard to run the system.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
