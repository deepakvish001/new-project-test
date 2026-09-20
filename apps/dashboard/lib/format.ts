/** ₹12,34,567 — Indian digit grouping. Rupees only; paise are noise on these screens. */
export function inr(paise: bigint | number, opts: { paise?: boolean } = {}): string {
  const p = typeof paise === "bigint" ? paise : BigInt(Math.round(paise));
  const neg = p < 0n;
  const abs = neg ? -p : p;
  const rupees = abs / 100n;
  const s = rupees.toString();
  const head = s.length > 3 ? s.slice(0, -3) : "";
  const tail = s.length > 3 ? s.slice(-3) : s;
  const grouped = head ? `${head.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${tail}` : tail;
  const pp = opts.paise ? `.${(abs % 100n).toString().padStart(2, "0")}` : "";
  return `${neg ? "−" : ""}₹${grouped}${pp}`;
}

/** ₹4.2L / ₹1.3Cr — how an Indian owner actually reads a number at a glance. */
export function inrShort(paise: bigint): string {
  const rupees = Number(paise / 100n);
  if (rupees >= 1e7) return `₹${(rupees / 1e7).toFixed(rupees >= 1e8 ? 1 : 2)}Cr`;
  if (rupees >= 1e5) return `₹${(rupees / 1e5).toFixed(rupees >= 1e6 ? 1 : 2)}L`;
  if (rupees >= 1e3) return `₹${(rupees / 1e3).toFixed(1)}K`;
  return `₹${rupees}`;
}

export function shortDate(d: string | Date | null): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(`${d}T00:00:00Z`) : d;
  return date.toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "2-digit", timeZone: "Asia/Kolkata",
  });
}

export function relTime(d: Date | null): string {
  if (!d) return "—";
  const mins = Math.round((Date.now() - new Date(d).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
}

export const LANGUAGES: Record<string, string> = {
  hi: "Hindi", pa: "Punjabi", gu: "Gujarati", mr: "Marathi", ta: "Tamil", en: "English",
};

export const RUNG_NAMES: Record<number, string> = {
  0: "Dormant",
  1: "Pre-due courtesy",
  2: "Due today",
  3: "Gentle follow-up",
  4: "Firm follow-up",
  5: "43B(h) intimation",
  6: "MSMED interest claim",
};

export const INTENT_LABELS: Record<string, { label: string; pill: string }> = {
  PROMISE_TO_PAY: { label: "Promise to pay", pill: "pill-accent" },
  ALREADY_PAID:   { label: "Claims paid",    pill: "pill-ok" },
  PARTIAL_PAYMENT:{ label: "Part payment",   pill: "pill-ok" },
  DISPUTE:        { label: "Dispute",        pill: "pill-danger" },
  HOSTILE:        { label: "Hostile",        pill: "pill-danger" },
  NEEDS_DOCUMENT: { label: "Wants document", pill: "pill-warn" },
  WRONG_NUMBER:   { label: "Wrong number",   pill: "pill-muted" },
  UNCLEAR:        { label: "Unclear",        pill: "pill-warn" },
  OTHER:          { label: "Other",          pill: "pill-muted" },
};
