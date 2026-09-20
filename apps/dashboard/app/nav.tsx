import { getKpis, getOrg } from "@bakaya/db/queries";
import { Shell } from "@/components/Shell";
import type { ReactNode } from "react";

/** Every page renders through this so the sidebar counts are always live. */
export async function AppShell({
  current, children,
}: { current: string; children: ReactNode }) {
  const [org, kpis] = await Promise.all([getOrg(), getKpis()]);
  const nav = [
    {
      group: "Collections",
      items: [
        { href: "/", icon: "◧", label: "Dashboard" },
        { href: "/invoices", icon: "▤", label: "Invoices" },
        { href: "/buyers", icon: "◎", label: "Buyers" },
      ],
    },
    {
      group: "Needs you",
      items: [
        { href: "/inbox", icon: "✉", label: "Inbox", count: kpis.needsHuman },
        { href: "/approvals", icon: "⚖", label: "Approvals", count: kpis.awaitingApproval },
      ],
    },
    {
      group: "Setup",
      items: [
        { href: "/onboarding", icon: "↥", label: "Import data" },
        { href: "/settings", icon: "⚙", label: "Settings" },
        { href: "/ca", icon: "◨", label: "CA portal" },
      ],
    },
  ];
  return <Shell current={current} org={org} nav={nav}>{children}</Shell>;
}
