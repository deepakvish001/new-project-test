import { getInvoice, getInvoiceTimeline, getPolicy } from "@bakaya/db/queries";
import { decide, istDate, type LadderDecision, type LadderInput } from "@bakaya/ladder";
import { AppShell } from "../../nav";
import { PageHead, RungBadge, StatusPill } from "@/components/Shell";
import { inr, LANGUAGES, relTime, RUNG_NAMES, shortDate } from "@/lib/format";
import { notFound } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

const DECISION_COPY: Record<string, { pill: string; title: string }> = {
  SEND: { pill: "pill-accent", title: "Will send" },
  WAIT: { pill: "pill-muted", title: "Waiting" },
  REQUEST_APPROVAL: { pill: "pill-warn", title: "Needs your approval" },
  HANDOFF_TO_OWNER: { pill: "pill-danger", title: "Handed to you" },
  STOP: { pill: "pill-ok", title: "Ladder closed" },
};

const REASON_COPY: Record<string, string> = {
  invoice_paid: "Invoice is settled.",
  invoice_closed: "Closed by a human decision.",
  contact_opted_out: "The buyer sent STOP. We never message them again.",
  buyer_paused: "You paused this buyer.",
  buyer_hostile: "The buyer's last reply was hostile. The ladder stopped and this is yours to handle — not rung 4 on schedule.",
  dispute_open: "There is an open dispute. We never dun a disputed invoice.",
  ladder_paused: "Paused pending reconciliation of a claimed payment.",
  promise_pending: "The buyer gave a date. Chasing them before it is how you lose face with your own customer.",
  below_min_amount: "Balance is below your minimum.",
  rung_already_sent: "This rung has already gone out. Waiting for the next one.",
  ladder_exhausted: "Every configured rung has been sent.",
  needs_legal_approval: "This is a legal rung. It never fires without your explicit approval on this invoice.",
  quiet_hours: "Outside your sending hours. A reminder at 2am reads as desperation.",
  weekend: "It is the weekend and this org does not send on weekends. It will go out on Monday morning.",
  due_date_passed: "The rung is due.",
  promise_broken: "The buyer broke a promise, so the ladder accelerated a rung.",
};

export default async function InvoiceDetail({
  params,
}: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [invoice, timeline, policy] = await Promise.all([
    getInvoice(id), getInvoiceTimeline(id), getPolicy(),
  ]);
  if (!invoice) notFound();

  // The decision shown here is computed live by the real engine — packages/ladder —
  // from this invoice's real state. It is not a stored field.
  const input: LadderInput = {
    invoice: {
      dueDate: istDate(invoice.due_date),
      amountPaise: invoice.amount_paise,
      paidPaise: invoice.paid_paise,
      status: invoice.status as LadderInput["invoice"]["status"],
      currentRung: invoice.current_rung,
      ladderPausedUntil: invoice.ladder_paused_until,
      legalApprovedAt: invoice.legal_approved_at,
    },
    buyer: {
      isPaused: invoice.buyer_paused,
      maxRungOverride: invoice.max_rung_override,
      preferredLanguage: invoice.preferred_language,
    },
    contact: { optedOutAt: invoice.opted_out_at },
    promises: invoice.promised_date
      ? [{
          promisedDate: istDate(invoice.promised_date),
          promisedPaise: null,
          status: invoice.promise_status as "PENDING" | "KEPT" | "BROKEN" | "SUPERSEDED",
          createdAtRung: invoice.current_rung,
          createdAt: new Date(Date.now() - 6 * 864e5),
        }]
      : [],
    disputes: invoice.has_dispute ? [{ status: "OPEN" }] : [],
    lastInbound: null,
    policy: {
      tone: policy.tone as "GENTLE" | "STANDARD" | "FIRM",
      rungOffsetsDays: policy.rung_offsets_days,
      maxAutoRung: policy.max_auto_rung,
      quietStartHourIst: policy.quiet_start_hour_ist,
      quietEndHourIst: policy.quiet_end_hour_ist,
      sendOnWeekends: policy.send_on_weekends,
      minInvoicePaise: policy.min_invoice_paise,
      pauseOnHostile: policy.pause_on_hostile,
      defaultLanguage: "hi",
    },
  };
  const decision: LadderDecision = decide(input, new Date());
  const copy = DECISION_COPY[decision.action]!;
  const outstanding = invoice.amount_paise - invoice.paid_paise;

  return (
    <AppShell current="/invoices">
      <PageHead
        title={invoice.invoice_number}
        sub={`${invoice.buyer_name} · raised ${shortDate(invoice.invoice_date)} · due ${shortDate(invoice.due_date)}`}
        actions={<>
          <Link href="/invoices" className="btn">← All invoices</Link>
          <button className="btn">Send ledger copy</button>
          {decision.action === "REQUEST_APPROVAL"
            ? <button className="btn btn-danger">Approve rung {decision.rung}</button>
            : decision.action === "HANDOFF_TO_OWNER"
              ? <button className="btn btn-primary">Resolve and resume</button>
            : decision.action === "STOP"
              ? <button className="btn" disabled>Ladder closed</button>
            : <button className="btn btn-primary">Send now</button>}
        </>}
      />

      <div className="grid g4" style={{ marginBottom: 16 }}>
        <div className="card kpi">
          <div className="kpi-label">Outstanding</div>
          <div className="kpi-value sm">{inr(outstanding)}</div>
          <div className="kpi-note">of {inr(invoice.amount_paise)}</div>
        </div>
        <div className="card kpi">
          <div className="kpi-label">Overdue</div>
          <div className="kpi-value sm">
            {invoice.days_overdue > 0 ? `${invoice.days_overdue} days` : "Not due"}
          </div>
          <div className="kpi-note">
            {invoice.days_overdue > 45 ? "past the MSMED 45-day limit"
              : invoice.days_overdue > 0 ? "inside the MSMED 45-day limit"
              : "not yet due"}
          </div>
        </div>
        <div className="card kpi">
          <div className="kpi-label">Current rung</div>
          <div className="kpi-value sm">{invoice.current_rung} · {RUNG_NAMES[invoice.current_rung]}</div>
          <div className="kpi-note">language: {LANGUAGES[invoice.preferred_language ?? "hi"]}</div>
        </div>
        <div className="card kpi">
          <div className="kpi-label">Status</div>
          <div className="kpi-value sm"><StatusPill status={invoice.status} /></div>
          <div className="kpi-note">{invoice.contact_name} · {invoice.contact_phone}</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <h2 className="card-title">What the engine will do next</h2>
          <span className="dimmer">computed live by packages/ladder</span>
        </div>
        <div className="card-body">
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 10 }}>
            <span className={`pill ${copy.pill}`} style={{ fontSize: 13, padding: "4px 12px" }}>
              {copy.title}
            </span>
            {"rung" in decision ? <RungBadge rung={decision.rung} /> : null}
            {"rung" in decision ? <span className="strong">{RUNG_NAMES[decision.rung]}</span> : null}
            {"until" in decision
              ? <span className="dim">until {shortDate(decision.until)}</span> : null}
            <span className="mono dimmer" style={{ marginLeft: "auto" }}>{decision.reason}</span>
          </div>
          <p className="page-sub" style={{ margin: 0 }}>{REASON_COPY[decision.reason]}</p>
          {"template" in decision ? (
            <div className="chat out" style={{ marginTop: 12, maxWidth: "100%" }}>
              Template <span className="mono">{decision.template}</span> · {decision.variant.toLowerCase().replace("_", " ")} variant
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid g2" style={{ alignItems: "start" }}>
        <div className="card">
          <div className="card-head"><h2 className="card-title">The ladder</h2></div>
          <div className="card-body">
            <div className="rung-ladder">
              {[1, 2, 3, 4, 5, 6].map((r) => {
                const offset = policy.rung_offsets_days[r - 1];
                const done = r <= invoice.current_rung;
                const legal = r > policy.max_auto_rung;
                return (
                  <div key={r} className={`rung-step${done ? " done" : ""}${legal && !done ? " locked" : ""}`}>
                    <RungBadge rung={r} />
                    <span className="step-day">
                      {offset === null ? "off" : offset < 0 ? `D${offset}` : `D+${offset}`}
                    </span>
                    <span style={{ flex: 1 }}>{RUNG_NAMES[r]}</span>
                    {done ? <span className="pill pill-ok">sent</span>
                      : legal ? <span className="pill pill-danger">needs approval</span>
                      : <span className="dimmer">auto</span>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h2 className="card-title">History</h2>
            <span className="dimmer">{timeline.length} events · append-only</span>
          </div>
          <div className="card-body">
            <div className="tl">
              {timeline.map((e, n) => (
                <div key={n} className={`tl-item k-${e.kind}`}>
                  <div className="tl-title">{e.title}</div>
                  <div className="tl-time">{relTime(e.at)}{e.meta ? ` · ${e.meta}` : ""}</div>
                  {e.body ? <div className="tl-body">{e.body}</div> : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
