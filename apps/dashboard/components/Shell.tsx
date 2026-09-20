import Link from "next/link";
import type { ReactNode } from "react";

interface NavEntry { href: string; icon: string; label: string; count?: number }

export function Shell({
  current, org, nav, children,
}: {
  current: string;
  org: { legal_name: string; plan: string };
  nav: { group: string; items: NavEntry[] }[];
  children: ReactNode;
}) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">ब</div>
          <div>
            <div className="brand-name">Bakaya</div>
            <div className="brand-sub">Collections</div>
          </div>
        </div>
        {nav.map((group) => (
          <div key={group.group}>
            <div className="nav-label">{group.group}</div>
            {group.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-item${current === item.href ? " active" : ""}`}
              >
                <span className="nav-icon">{item.icon}</span>
                {item.label}
                {item.count ? <span className="nav-count">{item.count}</span> : null}
              </Link>
            ))}
          </div>
        ))}
        <div className="sidebar-foot">
          <div className="org-chip">
            <strong>{org.legal_name}</strong>
            {org.plan} plan
          </div>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}

export function PageHead({
  title, sub, actions,
}: { title: string; sub?: string; actions?: ReactNode }) {
  return (
    <div className="page-head row-between">
      <div>
        <h1 className="page-title">{title}</h1>
        {sub ? <p className="page-sub">{sub}</p> : null}
      </div>
      {actions ? <div className="btn-row">{actions}</div> : null}
    </div>
  );
}

export function Kpi({
  label, value, note, tone, small,
}: {
  label: string; value: string; note?: string;
  tone?: "up" | "down"; small?: boolean;
}) {
  return (
    <div className="card kpi">
      <div className="kpi-label">{label}</div>
      <div className={`kpi-value${small ? " sm" : ""}`}>{value}</div>
      {note ? <div className={`kpi-note${tone ? ` ${tone}` : ""}`}>{note}</div> : null}
    </div>
  );
}

export function RungBadge({ rung }: { rung: number }) {
  return <span className={`rung r${rung}`}>{rung}</span>;
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    PAID: "pill-ok", OPEN: "pill-muted", PARTIALLY_PAID: "pill-accent",
    DISPUTED: "pill-danger", WRITTEN_OFF: "pill-muted", ON_HOLD: "pill-warn",
  };
  const label = status.replace("_", " ").toLowerCase();
  return <span className={`pill ${map[status] ?? "pill-muted"}`}>{label}</span>;
}
