import { listInbox } from "@bakaya/db/queries";
import { AppShell } from "../nav";
import { PageHead } from "@/components/Shell";
import { INTENT_LABELS, relTime, shortDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const CONFIDENCE_GATE = 0.85;

export default async function InboxPage() {
  const messages = await listInbox();
  const needsHuman = messages.filter((m) => m.needs_human);
  const auto = messages.filter((m) => !m.needs_human);

  return (
    <AppShell current="/inbox">
      <PageHead
        title="Inbox"
        sub={`${needsHuman.length} need a decision · ${auto.length} handled automatically`}
      />

      <div className="banner banner-accent">
        <span>◔</span>
        <div>
          Every reply is classified by Claude. Above <strong>{CONFIDENCE_GATE}</strong> confidence
          the system acts on its own; below it, the message waits for you here. Anything
          classified <strong>hostile</strong> stops the ladder immediately, at any confidence —
          a false positive costs one handoff, a false negative costs a trading relationship.
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <h2 className="card-title">Waiting on you</h2>
          <span className="dimmer">{needsHuman.length} messages</span>
        </div>
        <div className="card-body" style={{ display: "grid", gap: 14 }}>
          {needsHuman.length === 0 ? <div className="empty">Nothing waiting. Good.</div> : null}
          {needsHuman.map((m) => {
            const intent = INTENT_LABELS[m.intent] ?? INTENT_LABELS["OTHER"]!;
            return (
              <div key={m.id} style={{
                borderBottom: "1px solid var(--border)", paddingBottom: 14,
              }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 7 }}>
                  <strong>{m.buyer_name}</strong>
                  <span className="dimmer">{m.contact_name} · {m.from_e164}</span>
                  <span className={`pill ${intent.pill}`}>{intent.label}</span>
                  <span className={`pill ${m.confidence >= CONFIDENCE_GATE ? "pill-muted" : "pill-warn"}`}>
                    {(m.confidence * 100).toFixed(0)}% confident
                  </span>
                  <span className="dimmer" style={{ marginLeft: "auto" }}>{relTime(m.received_at)}</span>
                </div>
                <div className="chat in">{m.body}</div>
                <div className="btn-row" style={{ marginTop: 8 }}>
                  <button className="btn btn-sm btn-primary">Accept classification</button>
                  <button className="btn btn-sm">Reclassify</button>
                  <button className="btn btn-sm">Pause this buyer</button>
                  <button className="btn btn-sm">Reply myself</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2 className="card-title">Handled automatically</h2>
          <span className="dimmer">no action needed from you</span>
        </div>
        <table>
          <thead>
            <tr><th>Buyer</th><th>Reply</th><th>Classified as</th>
                <th className="num">Confidence</th><th>Action taken</th><th className="num">When</th></tr>
          </thead>
          <tbody>
            {auto.map((m) => {
              const intent = INTENT_LABELS[m.intent] ?? INTENT_LABELS["OTHER"]!;
              const promised = m.extracted?.["promised_date"] as string | undefined;
              const utr = m.extracted?.["utr_or_reference"] as string | undefined;
              const doc = m.extracted?.["requested_document"] as string | undefined;
              return (
                <tr key={m.id}>
                  <td className="strong">{m.buyer_name}</td>
                  <td className="dim" style={{ maxWidth: 300 }}>{m.body}</td>
                  <td><span className={`pill ${intent.pill}`}>{intent.label}</span></td>
                  <td className="num dim">{(m.confidence * 100).toFixed(0)}%</td>
                  <td className="dim">
                    {promised ? `Ladder paused until ${shortDate(promised)}`
                      : utr ? `Flagged for reconcile · UTR ${utr}`
                      : doc ? `Sent ${doc}`
                      : "Logged"}
                  </td>
                  <td className="num dimmer">{relTime(m.received_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
