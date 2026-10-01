/** Display formatters shared by server and client components. */

const usdFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usdFmtSmall = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
/** ICU-independent compact USD ($34K, $1.2M) so server and client render identically. */
function compactUsd(v: number): string {
  const abs = Math.abs(v);
  const [div, suffix] = abs >= 1e9 ? [1e9, "B"] : abs >= 1e6 ? [1e6, "M"] : [1e3, "K"];
  const n = (abs / div).toFixed(1).replace(/\.0$/, "");
  return `${v < 0 ? "-" : ""}$${n}${suffix}`;
}

export function formatUsd(v: number | null | undefined, opts: { compact?: boolean } = {}): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  if (opts.compact && Math.abs(v) >= 10_000) return compactUsd(v);
  return Math.abs(v) < 100 ? usdFmtSmall.format(v) : usdFmt.format(v);
}

export function formatAmount(v: number | null | undefined, maxDecimals = 4): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  const decimals = abs >= 1000 ? 2 : abs >= 1 ? Math.min(4, maxDecimals) : maxDecimals + 2;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: decimals }).format(v);
}

export function formatNumber(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return new Intl.NumberFormat("en-US").format(v);
}

export function formatPct(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return `${v.toFixed(digits)}%`;
}

export function shortAddress(a: string, head = 6, tail = 4): string {
  if (!a) return "";
  return a.length <= head + tail + 2 ? a : `${a.slice(0, head)}…${a.slice(-tail)}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");

function toDate(ts: number | string | null | undefined): Date | null {
  if (ts === null || ts === undefined) return null;
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Locale-independent UTC formatting (identical on server and client, avoiding hydration mismatches). */
export function formatDate(ts: number | string | null | undefined): string {
  const d = toDate(ts);
  return d ? `${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}` : "—";
}

export function formatDateTime(ts: number | string | null | undefined): string {
  const d = toDate(ts);
  return d ? `${formatDate(ts)}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC` : "—";
}

export function timeAgo(iso: string | number, now = Date.now()): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

/** "2026-03" → "Mar 26" (locale-independent). */
export function formatMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTHS[m - 1]} ${String(y).slice(2)}`;
}
