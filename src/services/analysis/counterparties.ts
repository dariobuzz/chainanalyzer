import type { ChainKey, Counterparty, EntityType, RiskCategory, Transfer } from "@/types/domain";
import { ENTITY_TYPE_LABEL, RISK_ENTITY_CATEGORY } from "@/lib/constants";
import type { EntityRegistry } from "@/services/intelligence/entities";
import type { SanctionsScreener } from "@/services/intelligence/sanctions";

/** Transfers that actually moved value between the subject and a third party. */
export function valueTransfers(transfers: Transfer[]) {
  return transfers.filter((t) => !t.isError && t.direction !== "self");
}

export function buildCounterparties(args: {
  chain: ChainKey;
  subject: string;
  transfers: Transfer[];
  contractFlags: Record<string, boolean>;
  registry: EntityRegistry;
  sanctions: SanctionsScreener;
}): Counterparty[] {
  const { chain, subject, transfers, contractFlags, registry, sanctions } = args;
  const map = new Map<
    string,
    { inUsd: number; outUsd: number; inHashes: Set<string>; outHashes: Set<string>; first: number; last: number; assets: Set<string>; calledWithMethod: boolean }
  >();

  for (const t of transfers) {
    if (t.direction === "self" || !t.counterparty || t.counterparty === subject) continue;
    let e = map.get(t.counterparty);
    if (!e) {
      e = { inUsd: 0, outUsd: 0, inHashes: new Set(), outHashes: new Set(), first: t.timestamp, last: t.timestamp, assets: new Set(), calledWithMethod: false };
      map.set(t.counterparty, e);
    }
    const usd = t.isError ? 0 : (t.usdValue ?? 0);
    if (t.direction === "in") {
      e.inUsd += usd;
      e.inHashes.add(t.hash);
    } else {
      e.outUsd += usd;
      e.outHashes.add(t.hash);
    }
    e.first = Math.min(e.first, t.timestamp);
    e.last = Math.max(e.last, t.timestamp);
    if (t.amount > 0) e.assets.add(t.asset.symbol);
    if (t.kind === "native" && t.direction === "out" && t.method) e.calledWithMethod = true;
  }

  const totalVolume = [...map.values()].reduce((s, e) => s + e.inUsd + e.outUsd, 0);

  const out: Counterparty[] = [];
  for (const [address, e] of map) {
    const label = registry.lookup(chain, address);
    const sanction = sanctions.check(address);
    const isContract = contractFlags[address] ?? (e.calledWithMethod ? true : null);
    let type: EntityType = label?.entityType ?? (isContract ? "smart_contract" : "unknown_wallet");
    if (sanction) type = "sanctioned";

    const riskTags = new Set<RiskCategory>();
    if (sanction) riskTags.add("sanctioned_address");
    const cat = label ? RISK_ENTITY_CATEGORY[label.entityType] : undefined;
    if (cat) riskTags.add(cat);

    const txHashes = new Set([...e.inHashes, ...e.outHashes]);
    out.push({
      address,
      label,
      type,
      displayName: sanction?.entity ?? label?.entityName ?? (type === "smart_contract" ? "Unidentified contract" : "Unknown wallet"),
      isContract,
      incomingUsd: e.inUsd,
      outgoingUsd: e.outUsd,
      incomingCount: e.inHashes.size,
      outgoingCount: e.outHashes.size,
      txCount: txHashes.size,
      exposurePct: totalVolume > 0 ? ((e.inUsd + e.outUsd) / totalVolume) * 100 : 0,
      firstInteraction: e.first,
      lastInteraction: e.last,
      assets: [...e.assets].slice(0, 6),
      sanction,
      riskTags: [...riskTags],
    });
  }

  return out.sort((a, b) => b.incomingUsd + b.outgoingUsd - (a.incomingUsd + a.outgoingUsd) || b.txCount - a.txCount);
}

export function typeLabel(t: EntityType) {
  return ENTITY_TYPE_LABEL[t];
}
