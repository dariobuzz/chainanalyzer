import type { BehaviorAnalysis, BehaviorMetric, Counterparty, Transfer } from "@/types/domain";
import { formatNumber, formatPct, formatUsd } from "@/lib/format";
import { valueTransfers } from "./counterparties";

const DAY = 86_400_000;
const RAPID_WINDOW_MS = 24 * 3_600_000;
/** Incoming transfers in this USD band are counted as threshold-avoidance (structuring) candidates. */
const STRUCTURING_BAND: [number, number] = [9_000, 10_000];

/**
 * Behavioral indicators computed exclusively from observable on-chain data.
 * No external intelligence is used here.
 */
export function analyzeBehavior(args: {
  transfers: Transfer[];
  counterparties: Counterparty[];
  firstActivity: number | null;
  now: number;
}): BehaviorAnalysis {
  const { counterparties, firstActivity, now } = args;
  const transfers = valueTransfers(args.transfers);
  const priced = transfers.filter((t) => t.usdValue !== null && t.usdValue > 0);
  const hashes = new Set(transfers.map((t) => t.hash));

  const walletAgeDays = firstActivity ? Math.max(0, Math.floor((now - firstActivity) / DAY)) : null;
  const activeDays = new Set(transfers.map((t) => Math.floor(t.timestamp / DAY))).size;
  const txPerActiveDay = activeDays ? hashes.size / activeDays : 0;
  const avgTransferUsd = priced.length ? priced.reduce((s, t) => s + (t.usdValue ?? 0), 0) / priced.length : null;
  const largest = priced.reduce<Transfer | null>((m, t) => (!m || (t.usdValue ?? 0) > (m.usdValue ?? 0) ? t : m), null);

  // Rapid movement: share of incoming value forwarded out within 24h (FIFO matching).
  const chrono = [...priced].sort((a, b) => a.timestamp - b.timestamp);
  const queue: { ts: number; usd: number }[] = [];
  let incoming = 0;
  let forwarded = 0;
  for (const t of chrono) {
    if (t.direction === "in") {
      queue.push({ ts: t.timestamp, usd: t.usdValue! });
      incoming += t.usdValue!;
    } else {
      let need = t.usdValue!;
      while (need > 0 && queue.length) {
        const head = queue[0];
        if (t.timestamp - head.ts > RAPID_WINDOW_MS) {
          queue.shift();
          continue;
        }
        const take = Math.min(need, head.usd);
        head.usd -= take;
        need -= take;
        forwarded += take;
        if (head.usd <= 0.01) queue.shift();
      }
    }
  }
  const rapidMovementPct = incoming > 0 ? (forwarded / incoming) * 100 : null;

  const totalIn = counterparties.reduce((s, c) => s + c.incomingUsd, 0);
  const totalOut = counterparties.reduce((s, c) => s + c.outgoingUsd, 0);
  const totalVol = totalIn + totalOut;
  const topIn = Math.max(0, ...counterparties.map((c) => c.incomingUsd));
  const topOut = Math.max(0, ...counterparties.map((c) => c.outgoingUsd));
  const incomingTopSharePct = totalIn > 0 ? (topIn / totalIn) * 100 : null;
  const outgoingTopSharePct = totalOut > 0 ? (topOut / totalOut) * 100 : null;

  const contractCps = new Set(counterparties.filter((c) => c.isContract).map((c) => c.address));
  const contractHashes = new Set(transfers.filter((t) => contractCps.has(t.counterparty)).map((t) => t.hash));
  const contractInteractionPct = hashes.size ? (contractHashes.size / hashes.size) * 100 : 0;

  const volOf = (type: Counterparty["type"]) =>
    counterparties.filter((c) => c.type === type).reduce((s, c) => s + c.incomingUsd + c.outgoingUsd, 0);
  const bridgeUsagePct = totalVol > 0 ? (volOf("bridge") / totalVol) * 100 : 0;
  const dexUsagePct = totalVol > 0 ? (volOf("dex") / totalVol) * 100 : 0;

  const structuringCandidates = priced.filter(
    (t) => t.direction === "in" && t.usdValue! >= STRUCTURING_BAND[0] && t.usdValue! < STRUCTURING_BAND[1],
  ).length;

  const metrics: BehaviorMetric[] = [
    {
      key: "wallet_age",
      label: "Wallet age",
      value: walletAgeDays === null ? "Unknown" : `${formatNumber(walletAgeDays)} days`,
      detail: "Days since the first observed on-chain activity.",
      flag: walletAgeDays !== null && walletAgeDays < 90 ? "elevated" : "neutral",
    },
    {
      key: "frequency",
      label: "Transaction frequency",
      value: `${txPerActiveDay.toFixed(1)} / active day`,
      detail: `${formatNumber(hashes.size)} transactions over ${formatNumber(activeDays)} active days.`,
      flag: txPerActiveDay >= 25 ? "elevated" : txPerActiveDay >= 10 ? "notice" : "neutral",
    },
    {
      key: "avg_size",
      label: "Average transfer size",
      value: formatUsd(avgTransferUsd),
      detail: `Across ${formatNumber(priced.length)} priced transfers.`,
      flag: "neutral",
    },
    {
      key: "largest",
      label: "Largest transfer",
      value: formatUsd(largest?.usdValue ?? null),
      detail: largest ? `${largest.direction === "in" ? "Incoming" : "Outgoing"} transfer.` : "No priced transfers.",
      flag: "neutral",
    },
    {
      key: "rapid",
      label: "Rapid movement of incoming funds",
      value: formatPct(rapidMovementPct),
      detail: "Share of incoming value matched by outgoing transfers within 24 hours.",
      flag: rapidMovementPct !== null && rapidMovementPct >= 70 ? "elevated" : rapidMovementPct !== null && rapidMovementPct >= 50 ? "notice" : "neutral",
    },
    {
      key: "counterparties",
      label: "Unique counterparties",
      value: formatNumber(counterparties.length),
      detail: "Distinct addresses that sent to or received from this wallet.",
      flag: counterparties.length > 500 ? "notice" : "neutral",
    },
    {
      key: "in_concentration",
      label: "Concentration of incoming funds",
      value: formatPct(incomingTopSharePct),
      detail: "Share of incoming value from the single largest source.",
      flag: "neutral",
    },
    {
      key: "out_concentration",
      label: "Concentration of outgoing funds",
      value: formatPct(outgoingTopSharePct),
      detail: "Share of outgoing value to the single largest destination.",
      flag: "neutral",
    },
    {
      key: "contracts",
      label: "Interaction with contracts",
      value: formatPct(contractInteractionPct),
      detail: "Share of transactions involving a smart contract counterparty.",
      flag: "neutral",
    },
    {
      key: "bridge",
      label: "Bridge usage",
      value: formatPct(bridgeUsagePct),
      detail: "Share of priced volume exchanged with identified bridges.",
      flag: bridgeUsagePct >= 30 ? "notice" : "neutral",
    },
    {
      key: "dex",
      label: "DEX usage",
      value: formatPct(dexUsagePct),
      detail: "Share of priced volume exchanged with identified decentralized exchanges.",
      flag: "neutral",
    },
    {
      key: "structuring",
      label: "Transfers just below USD 10,000",
      value: formatNumber(structuringCandidates),
      detail: "Incoming transfers valued between USD 9,000 and 9,999 (possible threshold avoidance).",
      flag: structuringCandidates >= 3 ? "elevated" : "neutral",
    },
  ];

  return {
    walletAgeDays,
    activeDays,
    txPerActiveDay,
    avgTransferUsd,
    largestTransfer: largest ? { usd: largest.usdValue!, hash: largest.hash, direction: largest.direction } : null,
    rapidMovementPct,
    incomingTopSharePct,
    outgoingTopSharePct,
    contractInteractionPct,
    bridgeUsagePct,
    dexUsagePct,
    structuringCandidates,
    metrics,
  };
}
