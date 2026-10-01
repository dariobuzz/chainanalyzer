import type { BehaviorAnalysis, Counterparty, FundFlows, RiskAssessment, SanctionMatch, WalletOverview } from "@/types/domain";
import { RISK_CATEGORY_LABEL } from "@/lib/constants";
import { formatNumber, formatPct, formatUsd } from "@/lib/format";

/**
 * Investigation summary built deterministically from analysis results.
 * No language model is involved: every sentence is a template filled with
 * measured values, so nothing can be stated that the data does not support.
 */
export function buildSummary(args: {
  overview: WalletOverview;
  flows: FundFlows;
  counterparties: Counterparty[];
  behavior: BehaviorAnalysis;
  risk: RiskAssessment;
  subjectSanction: SanctionMatch | null;
  sanctionsAvailable: boolean;
  sanctionsAsOf: string | null;
  demo: boolean;
}): string[] {
  const { overview: o, flows, counterparties, behavior: b, risk, subjectSanction } = args;
  const s: string[] = [];

  if (args.demo) s.push("This summary is based on DEMO DATA generated for demonstration purposes and does not describe a real wallet.");

  if (!o.transactionsAnalyzed) {
    s.push("No on-chain activity was found for this address on the selected blockchain.");
  } else {
    const since = o.firstActivity
      ? new Date(o.firstActivity).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })
      : null;
    s.push(
      `${since ? `Wallet active since ${since}` : "Wallet"} with ${formatNumber(o.transactionsAnalyzed)} analyzed transactions${o.totalTransactions.isLowerBound ? " (most recent history only; earlier activity not analyzed)" : ""} and ${formatNumber(o.uniqueCounterparties)} unique counterparties.`,
    );
  }

  // Source of funds
  if (flows.totalIncomingUsd > 0) {
    const share = (pred: (c: Counterparty) => boolean) =>
      (counterparties.filter(pred).reduce((x, c) => x + c.incomingUsd, 0) / flows.totalIncomingUsd) * 100;
    const cex = share((c) => c.type === "cex");
    const unidentified = share((c) => !c.label && !c.sanction);
    const top = flows.sources[0];
    if (cex >= 40) {
      const names = [...new Set(counterparties.filter((c) => c.type === "cex" && c.incomingUsd > 0).map((c) => c.displayName))].slice(0, 3);
      s.push(`Most incoming value (${formatPct(cex)}) originates from identifiable centralized exchanges (${names.join(", ")}).`);
    } else if (unidentified >= 50) {
      s.push(`${formatPct(unidentified)} of incoming value originates from unidentified wallets or contracts; the ultimate source of these funds cannot be determined from available intelligence.`);
    } else if (top) {
      s.push(`The largest source of incoming value is ${top.label} (${formatPct(top.pct)} of ${formatUsd(flows.totalIncomingUsd)} received).`);
    }
  }

  // Destination of funds
  if (flows.totalOutgoingUsd > 0) {
    const outShare = (type: Counterparty["type"]) =>
      (counterparties.filter((c) => c.type === type).reduce((x, c) => x + c.outgoingUsd, 0) / flows.totalOutgoingUsd) * 100;
    const parts: string[] = [];
    const dex = outShare("dex");
    const bridge = outShare("bridge");
    const cex = outShare("cex");
    if (cex > 0) parts.push(`${formatPct(cex)} to centralized exchanges`);
    if (dex > 0) parts.push(`${formatPct(dex)} to decentralized exchanges`);
    if (bridge > 0) parts.push(`${formatPct(bridge)} to cross-chain bridges`);
    if (parts.length) s.push(`Of the analyzed outgoing value (${formatUsd(flows.totalOutgoingUsd)}), ${parts.join(", ")}.`);
  }

  // Sanctions
  const sanctionedCps = counterparties.filter((c) => c.sanction);
  if (subjectSanction) {
    s.push(`The analyzed address itself matches an entry on the ${subjectSanction.source}: ${subjectSanction.entity} (program ${subjectSanction.program}, ${subjectSanction.reference}).`);
  } else if (sanctionedCps.length) {
    const exp = sanctionedCps.reduce((x, c) => x + c.exposurePct, 0);
    s.push(
      `${sanctionedCps.length} counterpart${sanctionedCps.length === 1 ? "y matches" : "ies match"} a sanctions list entry (${sanctionedCps.map((c) => c.displayName).join(", ")}), representing ${formatPct(exp)} of analyzed volume.`,
    );
  } else if (args.sanctionsAvailable) {
    s.push(`No verified sanctioned counterparties were identified in the currently available intelligence sources (OFAC SDN list as of ${args.sanctionsAsOf?.slice(0, 10)}).`);
  } else {
    s.push("Sanctions screening could not be performed because no sanctions dataset is currently loaded.");
  }

  // Other verified intelligence
  const otherVerified = risk.indicators.filter((i) => i.group === "verified_intelligence" && i.status === "detected" && i.category !== "sanctioned_address");
  if (otherVerified.length) {
    s.push(`Verified intelligence indicates exposure to: ${otherVerified.map((i) => i.label.toLowerCase()).join(", ")}.`);
  }

  // Behavioral
  const beh = risk.indicators.filter((i) => i.group === "behavioral" && i.status === "detected" && i.scoreContribution > 0);
  if (beh.length) s.push(`Behavioral indicators observed: ${beh.map((i) => RISK_CATEGORY_LABEL[i.category].toLowerCase()).join(", ")}.`);
  if (b.rapidMovementPct !== null && b.rapidMovementPct >= 50) {
    s.push(`${formatPct(b.rapidMovementPct)} of incoming value was moved onward within 24 hours of receipt.`);
  }

  const scoring = risk.riskFactors.filter((f) => f.scoreContribution > 0).length;
  s.push(
    `Resulting risk score: ${risk.riskScore}/100 (${risk.riskLevel}), derived from ${scoring} documented risk factor${scoring === 1 ? "" : "s"} contributing points; analysis confidence ${risk.confidence.level.toLowerCase()}.`,
  );
  return s;
}
