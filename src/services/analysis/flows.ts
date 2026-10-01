import type { Counterparty, FlowBucket, FundFlows, MonthlyActivity, Transfer } from "@/types/domain";
import { ENTITY_TYPE_LABEL } from "@/lib/constants";

const TOP_BUCKETS = 5;

/**
 * Source / destination of funds.
 * Identified entities are grouped by entity name (e.g. all Coinbase hot
 * wallets → "Coinbase"); unidentified addresses are grouped by type.
 */
function buckets(counterparties: Counterparty[], side: "in" | "out"): { list: FlowBucket[]; total: number } {
  const groups = new Map<string, FlowBucket>();
  for (const c of counterparties) {
    const usd = side === "in" ? c.incomingUsd : c.outgoingUsd;
    if (usd <= 0) continue;
    const identified = Boolean(c.label || c.sanction);
    const key = identified ? `entity:${c.displayName}` : `type:${c.type}`;
    const label = identified ? c.displayName : c.type === "smart_contract" ? "Unidentified contracts" : "Unknown wallets";
    const g = groups.get(key) ?? { key, label, type: c.type, usd: 0, pct: 0, addresses: 0 };
    g.usd += usd;
    g.addresses += 1;
    groups.set(key, g);
  }
  const total = [...groups.values()].reduce((s, g) => s + g.usd, 0);
  const sorted = [...groups.values()].sort((a, b) => b.usd - a.usd);
  const top = sorted.slice(0, TOP_BUCKETS);
  const rest = sorted.slice(TOP_BUCKETS);
  if (rest.length) {
    top.push({
      key: "other",
      label: "Other",
      type: "other",
      usd: rest.reduce((s, g) => s + g.usd, 0),
      pct: 0,
      addresses: rest.reduce((s, g) => s + g.addresses, 0),
    });
  }
  for (const g of top) g.pct = total > 0 ? (g.usd / total) * 100 : 0;
  return { list: top, total };
}

export function buildFlows(counterparties: Counterparty[]): FundFlows {
  const src = buckets(counterparties, "in");
  const dst = buckets(counterparties, "out");
  return { sources: src.list, destinations: dst.list, totalIncomingUsd: src.total, totalOutgoingUsd: dst.total };
}

export function buildMonthly(transfers: Transfer[]): MonthlyActivity[] {
  const m = new Map<string, MonthlyActivity & { hashes: Set<string> }>();
  for (const t of transfers) {
    if (t.isError || t.direction === "self") continue;
    const d = new Date(t.timestamp);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const e = m.get(key) ?? { month: key, incomingUsd: 0, outgoingUsd: 0, txCount: 0, hashes: new Set<string>() };
    if (t.direction === "in") e.incomingUsd += t.usdValue ?? 0;
    else e.outgoingUsd += t.usdValue ?? 0;
    e.hashes.add(t.hash);
    m.set(key, e);
  }
  const rows = [...m.values()].sort((a, b) => a.month.localeCompare(b.month));
  // Fill gaps so the timeline is continuous.
  const out: MonthlyActivity[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    out.push({ month: r.month, incomingUsd: r.incomingUsd, outgoingUsd: r.outgoingUsd, txCount: r.hashes.size });
    const next = rows[i + 1];
    if (!next) break;
    let [y, mo] = r.month.split("-").map(Number);
    for (;;) {
      mo += 1;
      if (mo > 12) {
        mo = 1;
        y += 1;
      }
      const k = `${y}-${String(mo).padStart(2, "0")}`;
      if (k >= next.month) break;
      out.push({ month: k, incomingUsd: 0, outgoingUsd: 0, txCount: 0 });
    }
  }
  return out.slice(-36);
}

export function entityTypeLabel(t: FlowBucket["type"]) {
  return t === "other" ? "Other" : ENTITY_TYPE_LABEL[t];
}
