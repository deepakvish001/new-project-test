/**
 * Capture a screenshot of every dashboard page.
 *
 *   node scripts/screenshots.mjs            # light theme
 *   THEME=dark node scripts/screenshots.mjs
 *
 * The dashboard must already be running on BASE (default http://127.0.0.1:3100).
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = process.env.BASE ?? "http://127.0.0.1:3100";
const THEME = process.env.THEME ?? "light";
const OUT = process.env.OUT ?? `docs/screenshots`;

// Use the browser already on the image rather than downloading a matching build.
const EXECUTABLE = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const PAGES = [
  ["01-dashboard",  "/",           "Dashboard — KPIs, ageing, tonight's digest"],
  ["02-invoices",   "/invoices",   "Invoices — ageing table with live ladder state"],
  ["06-buyers",     "/buyers",     "Buyers — outstanding, broken promises, risk"],
  ["07-inbox",      "/inbox",      "Inbox — AI-classified buyer replies"],
  ["08-approvals",  "/approvals",  "Approvals — 43B(h) with the s.16 computation"],
  ["09-settings",   "/settings",   "Settings — ladder, tone, window, safety"],
  ["10-onboarding", "/onboarding", "Import data — upload, connector, setup progress"],
  ["11-ca-portal",  "/ca",         "CA portal — multi-client view and commission"],
];

/**
 * Three invoice details, chosen to show three DIFFERENT engine decisions. The guards that
 * produce them all sit above the send-window guard, so these read correctly whatever day
 * the screenshots are taken on.
 */
const INVOICE_DETAILS = [
  ["03-invoice-needs-approval", "LU/26-27/0305", "Invoice — engine asks for approval before a legal rung"],
  ["04-invoice-promise-held",   "LU/26-27/0376", "Invoice — ladder suppressed by a promise to pay"],
  ["05-invoice-dispute",        "LU/26-27/0361", "Invoice — dispute stops the ladder, handed to the owner"],
];

const browser = await chromium.launch({ executablePath: EXECUTABLE });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  colorScheme: THEME === "dark" ? "dark" : "light",
  timezoneId: "Asia/Kolkata",
  locale: "en-IN",
});
await mkdir(OUT, { recursive: true });

// Resolve each invoice number to its URL from the list page.
const probe = await ctx.newPage();
await probe.goto(`${BASE}/invoices?filter=all`, { waitUntil: "networkidle" });
const hrefByNumber = new Map();
for (const link of await probe.locator('a[href^="/invoices/"]').all()) {
  hrefByNumber.set((await link.innerText()).trim(), await link.getAttribute("href"));
}
await probe.close();

for (const [name, number, caption] of INVOICE_DETAILS) {
  const href = hrefByNumber.get(number);
  if (!href) throw new Error(`Invoice ${number} not on the list page — reseed the demo data`);
  PAGES.push([name, href, caption]);
}
PAGES.sort((a, b) => a[0].localeCompare(b[0]));

const suffix = THEME === "dark" ? "-dark" : "";
for (const [name, path, caption] of PAGES) {
  const url = `${BASE}${path}`;
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "networkidle" });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const file = `${OUT}/${name}${suffix}.png`;
  await page.screenshot({ path: file, fullPage: true });
  console.log(`${file.padEnd(46)} ${caption}`);
  await page.close();
}

await browser.close();
console.log(`\n${PAGES.length} screenshots written to ${OUT}/ (${THEME})`);
