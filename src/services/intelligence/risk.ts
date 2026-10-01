import type {
  BehaviorAnalysis,
  ChainKey,
  Counterparty,
  DataSource,
  EntityLabel,
  EntityType,
  RiskAssessment,
  RiskCategory,
  RiskFactor,
  RiskIndicator,
  SanctionMatch,
  Severity,
} from "@/types/domain";
import { METHODOLOGY_VERSION, NO_INTEL, RISK_CATEGORY_LABEL, RISK_ENTITY_CATEGORY, riskLevelFor } from "@/lib/constants";
import { formatPct, formatUsd, shortAddress } from "@/lib/format";

/**
 * ChainScope Risk Engine (methodology CS-RISK-0.1)
 *
 * Principles
 *  1. Every point of the score comes from a documented RiskFactor with evidence and source.
 *  2. Verified intelligence (sanctions lists, labelled entities) is kept separate
 *     from behavioral indicators derived from on-chain observations.
 *  3. No source → no classification: categories without a reliable dataset are
 *     reported as "Unknown / No verified intelligence available" and add 0 points.
 *  4. Score = min(100, Σ contributions). A direct sanctions match on the analyzed
 *     address sets the score to 100.
 */

interface VerifiedRule {
  category: RiskCategory;
  entityTypes: EntityType[];
  base: number;
  /** Additional points scaled by exposure share (full at ≥ EXPOSURE_FULL_PCT). */
  scale: number;
  severity: Severity;
  why: string;
}

const EXPOSURE_FULL_PCT = 20;

export const VERIFIED_RULES: VerifiedRule[] = [
  { category: "sanctioned_address", entityTypes: ["sanctioned"], base: 45, scale: 25, severity: "critical", why: "Direct exposure to an address on an official sanctions list." },
  { category: "ransomware", entityTypes: ["ransomware"], base: 35, scale: 25, severity: "critical", why: "Exposure to addresses attributed to ransomware operations." },
  { category: "stolen_funds", entityTypes: ["stolen_funds"], base: 30, scale: 25, severity: "high", why: "Exposure to addresses attributed to hacks or thefts." },
  { category: "darknet_exposure", entityTypes: ["darknet"], base: 30, scale: 25, severity: "high", why: "Exposure to addresses attributed to darknet markets." },
  { category: "mixer_exposure", entityTypes: ["mixer"], base: 25, scale: 25, severity: "high", why: "Mixers break the traceability of funds." },
  { category: "known_scam", entityTypes: ["scam"], base: 20, scale: 20, severity: "high", why: "Exposure to addresses attributed to scams or phishing." },
  { category: "high_risk_exchange", entityTypes: ["high_risk_exchange"], base: 12, scale: 13, severity: "medium", why: "Exchanges with weak or no KYC/AML controls." },
  { category: "unlicensed_service", entityTypes: ["unlicensed_service"], base: 12, scale: 13, severity: "medium", why: "Services operating without the required licences." },
  { category: "gambling", entityTypes: ["gambling"], base: 6, scale: 9, severity: "low", why: "Gambling services carry elevated ML typology risk." },
];

export interface RiskInput {
  chain: ChainKey;
  subject: string;
  counterparties: Counterparty[];
  behavior: BehaviorAnalysis;
  subjectSanction: SanctionMatch | null;
  subjectLabel: EntityLabel | null;
  sanctionsAvailable: boolean;
  sanctionsAsOf: string | null;
  sanctionsAddressCount: number;
  registryCoverage: Partial<Record<EntityType, number>>;
  analyzedTransactions: number;
  truncated: boolean;
  unpricedShare: number;
  unidentifiedVolumeShare: number;
  dataSources: DataSource[];
  demo: boolean;
}

const r1 = (v: number) => Math.round(v * 10) / 10;

function evidenceFor(c: Counterparty): string {
  const src = c.sanction
    ? `${c.sanction.source}, ${c.sanction.reference}`
    : c.label
      ? `${c.label.source}${c.label.reference ? `, ${c.label.reference}` : ""}`
      : "";
  return `${c.displayName} (${shortAddress(c.address)}): in ${formatUsd(c.incomingUsd)}, out ${formatUsd(c.outgoingUsd)}, ${c.txCount} tx, ${formatPct(c.exposurePct)} of volume${src ? ` [${src}]` : ""}`;
}

function verifiedIndicators(input: RiskInput): RiskIndicator[] {
  return VERIFIED_RULES.map((rule): RiskIndicator => {
    const label = RISK_CATEGORY_LABEL[rule.category];
    const base = { category: rule.category, label, group: "verified_intelligence" as const };

    // Subject itself
    const subjectHit =
      (rule.category === "sanctioned_address" && input.subjectSanction) ||
      (input.subjectLabel && RISK_ENTITY_CATEGORY[input.subjectLabel.entityType] === rule.category);
    if (subjectHit) {
      const s = input.subjectSanction;
      const contribution = rule.category === "sanctioned_address" ? 100 : rule.base + rule.scale;
      return {
        ...base,
        status: "detected",
        severity: "critical",
        scoreContribution: contribution,
        description: `The analyzed address itself is identified as: ${s ? `${s.entity} (sanctions program ${s.program})` : input.subjectLabel!.entityName}. ${rule.why}`,
        evidence: [
          s
            ? `Exact address match: ${s.entity}, program ${s.program}, ${s.reference}, list date ${s.date}`
            : `Registry label: ${input.subjectLabel!.entityName} (confidence ${Math.round(input.subjectLabel!.confidence * 100)}%)`,
        ],
        source: s ? s.source : input.subjectLabel!.source,
      };
    }

    const hits = input.counterparties.filter((c) => c.riskTags.includes(rule.category));
    if (hits.length) {
      const exposure = hits.reduce((s, c) => s + c.exposurePct, 0);
      const contribution = r1(rule.base + rule.scale * Math.min(1, exposure / EXPOSURE_FULL_PCT));
      const sources = [...new Set(hits.map((c) => c.sanction?.source ?? c.label?.source ?? "").filter(Boolean))];
      return {
        ...base,
        status: "detected",
        severity: rule.severity,
        scoreContribution: contribution,
        description: `${hits.length} counterpart${hits.length === 1 ? "y" : "ies"} with verified ${label.toLowerCase()} classification, ${formatPct(exposure)} of priced volume. ${rule.why}`,
        evidence: hits.slice(0, 6).map(evidenceFor),
        source: sources.join("; "),
      };
    }

    // No hit: is there a source that could have produced one?
    if (rule.category === "sanctioned_address") {
      return input.sanctionsAvailable
        ? {
            ...base,
            status: "not_detected",
            severity: null,
            scoreContribution: 0,
            description: `No exact match between the wallet or its ${input.counterparties.length} counterparties and ${input.sanctionsAddressCount} EVM addresses on the OFAC SDN list.`,
            evidence: [],
            source: `OFAC SDN list (as of ${input.sanctionsAsOf?.slice(0, 10)})`,
          }
        : {
            ...base,
            status: "no_verified_intelligence",
            severity: null,
            scoreContribution: 0,
            description: `${NO_INTEL}. No sanctions dataset is loaded (run "npm run sanctions:sync").`,
            evidence: [],
            source: "—",
          };
    }

    const coverage = rule.entityTypes.reduce((s, t) => s + (input.registryCoverage[t] ?? 0), 0);
    if (coverage > 0) {
      return {
        ...base,
        status: "not_detected",
        severity: null,
        scoreContribution: 0,
        description: `No interaction with the ${coverage} address${coverage === 1 ? "" : "es"} labelled as ${label.toLowerCase()} in the entity registry. Registry coverage is partial: absence of a match is not proof of absence.`,
        evidence: [],
        source: "ChainScope Entity Registry",
      };
    }
    return {
      ...base,
      status: "no_verified_intelligence",
      severity: null,
      scoreContribution: 0,
      description: `${NO_INTEL}. No reliable dataset for this category is currently connected; no risk is attributed.`,
      evidence: [],
      source: "—",
    };
  });
}

function behavioralIndicators(input: RiskInput): RiskIndicator[] {
  const b = input.behavior;
  const out: RiskIndicator[] = [];
  const mk = (category: RiskCategory, rest: Omit<RiskIndicator, "category" | "label" | "group" | "source"> & { source?: string }): RiskIndicator => ({
    category,
    label: RISK_CATEGORY_LABEL[category],
    group: "behavioral",
    source: rest.source ?? "On-chain behavioral analysis",
    ...rest,
  });

  // Bridge exposure
  if (b.bridgeUsagePct > 0) {
    const pts = b.bridgeUsagePct >= 30 ? 6 : b.bridgeUsagePct >= 10 ? 3 : 1;
    const bridges = input.counterparties.filter((c) => c.type === "bridge");
    out.push(
      mk("bridge_exposure", {
        status: "detected",
        severity: pts >= 6 ? "medium" : "low",
        scoreContribution: pts,
        description: `${formatPct(b.bridgeUsagePct)} of priced volume exchanged with cross-chain bridges. Bridges are lawful infrastructure but can interrupt the traceability of funds across chains.`,
        evidence: bridges.slice(0, 5).map(evidenceFor),
      }),
    );
  } else {
    out.push(mk("bridge_exposure", { status: "not_detected", severity: null, scoreContribution: 0, description: "No interaction with identified bridges.", evidence: [] }));
  }

  // DEX exposure (informational; DEX use is common)
  if (b.dexUsagePct > 0) {
    const pts = b.dexUsagePct >= 50 ? 3 : 0;
    out.push(
      mk("dex_exposure", {
        status: "detected",
        severity: pts ? "low" : "info",
        scoreContribution: pts,
        description: `${formatPct(b.dexUsagePct)} of priced volume exchanged with decentralized exchanges. DEX usage is common; it is reported for context and scores only when dominant (≥ 50%).`,
        evidence: input.counterparties.filter((c) => c.type === "dex").slice(0, 5).map(evidenceFor),
      }),
    );
  } else {
    out.push(mk("dex_exposure", { status: "not_detected", severity: null, scoreContribution: 0, description: "No interaction with identified decentralized exchanges.", evidence: [] }));
  }

  // High velocity
  if (input.analyzedTransactions < 10) {
    out.push(mk("high_velocity", { status: "insufficient_data", severity: null, scoreContribution: 0, description: "Fewer than 10 transactions analyzed: velocity cannot be assessed.", evidence: [] }));
  } else if (b.txPerActiveDay >= 10) {
    const pts = b.txPerActiveDay >= 25 ? 8 : 4;
    out.push(
      mk("high_velocity", {
        status: "detected",
        severity: pts === 8 ? "medium" : "low",
        scoreContribution: pts,
        description: `Average of ${b.txPerActiveDay.toFixed(1)} transactions per active day (threshold: 10 notice, 25 elevated).`,
        evidence: [`${input.analyzedTransactions} transactions over ${b.activeDays} active days`],
      }),
    );
  } else {
    out.push(mk("high_velocity", { status: "not_detected", severity: null, scoreContribution: 0, description: `Average of ${b.txPerActiveDay.toFixed(1)} transactions per active day (below 10).`, evidence: [] }));
  }

  // Recently created
  if (b.walletAgeDays === null) {
    out.push(mk("recently_created", { status: "insufficient_data", severity: null, scoreContribution: 0, description: "First activity date unavailable.", evidence: [] }));
  } else if (b.walletAgeDays < 90) {
    const pts = b.walletAgeDays < 30 ? 10 : 5;
    out.push(
      mk("recently_created", {
        status: "detected",
        severity: pts === 10 ? "medium" : "low",
        scoreContribution: pts,
        description: `First on-chain activity ${b.walletAgeDays} days ago (thresholds: < 30 days elevated, < 90 days notice).`,
        evidence: [`Wallet age: ${b.walletAgeDays} days`],
      }),
    );
  } else {
    out.push(mk("recently_created", { status: "not_detected", severity: null, scoreContribution: 0, description: `Wallet active for ${b.walletAgeDays} days.`, evidence: [] }));
  }

  // Unusual pattern: pass-through and structuring
  const incoming = input.counterparties.reduce((s, c) => s + c.incomingUsd, 0);
  if (b.rapidMovementPct === null && b.structuringCandidates === 0) {
    out.push(mk("unusual_pattern", { status: "insufficient_data", severity: null, scoreContribution: 0, description: "Not enough priced incoming transfers to assess transaction patterns.", evidence: [] }));
  } else {
    let pts = 0;
    const evidence: string[] = [];
    if (b.rapidMovementPct !== null && incoming >= 10_000 && b.rapidMovementPct >= 50) {
      const p = b.rapidMovementPct >= 70 ? 10 : 5;
      pts += p;
      evidence.push(`${formatPct(b.rapidMovementPct)} of incoming value (${formatUsd(incoming)}) forwarded within 24 hours (pass-through behaviour)`);
    }
    if (b.structuringCandidates >= 3) {
      pts += 6;
      evidence.push(`${b.structuringCandidates} incoming transfers valued between USD 9,000 and 9,999`);
    }
    pts = Math.min(15, pts);
    out.push(
      pts > 0
        ? mk("unusual_pattern", {
            status: "detected",
            severity: pts >= 10 ? "medium" : "low",
            scoreContribution: pts,
            description: "Transaction patterns consistent with pass-through activity and/or threshold avoidance.",
            evidence,
          })
        : mk("unusual_pattern", {
            status: "not_detected",
            severity: null,
            scoreContribution: 0,
            description: `No pass-through (≥ 50% forwarded within 24h) or threshold-avoidance pattern detected${b.rapidMovementPct !== null ? ` (forwarded within 24h: ${formatPct(b.rapidMovementPct)})` : ""}.`,
            evidence: [],
          }),
    );
  }
  return out;
}

function confidence(input: RiskInput): RiskAssessment["confidence"] {
  let score = 100;
  const reasons: string[] = [];
  if (input.demo) reasons.push("Demo data: illustrative only, not derived from the live blockchain.");
  if (input.analyzedTransactions === 0) {
    score -= 60;
    reasons.push("No on-chain activity found: the score reflects an absence of data, not an absence of risk.");
  } else if (input.analyzedTransactions < 5) {
    score -= 30;
    reasons.push("Very limited on-chain activity.");
  }
  if (input.truncated) {
    score -= 15;
    reasons.push(`History truncated: only the most recent ${input.analyzedTransactions} transactions were analyzed.`);
  }
  if (!input.sanctionsAvailable) {
    score -= 25;
    reasons.push("No sanctions dataset loaded: sanctions screening not performed.");
  }
  if (input.unpricedShare > 0.3) {
    score -= 10;
    reasons.push(`${formatPct(input.unpricedShare * 100, 0)} of transfers involve assets without a reliable USD price.`);
  }
  if (input.unidentifiedVolumeShare > 0.7) {
    score -= 10;
    reasons.push(`${formatPct(input.unidentifiedVolumeShare * 100, 0)} of volume involves unidentified counterparties.`);
  }
  reasons.push("Intelligence coverage limited to the connected datasets (OFAC SDN, ChainScope Entity Registry).");
  score = Math.max(0, score);
  return { level: score >= 75 ? "High" : score >= 50 ? "Medium" : "Low", score, reasons };
}

export function assessRisk(input: RiskInput): RiskAssessment {
  const indicators = [...verifiedIndicators(input), ...behavioralIndicators(input)];
  const riskFactors: RiskFactor[] = indicators
    .filter((i) => i.status === "detected")
    .map((i) => ({
      category: i.category,
      severity: i.severity ?? "info",
      scoreContribution: i.scoreContribution,
      description: i.description,
      evidence: i.evidence,
      source: i.source,
    }))
    .sort((a, b) => b.scoreContribution - a.scoreContribution);

  const sum = riskFactors.reduce((s, f) => s + f.scoreContribution, 0);
  const riskScore = input.subjectSanction ? 100 : Math.min(100, Math.round(sum));

  return {
    riskScore,
    riskLevel: riskLevelFor(riskScore),
    riskFactors,
    indicators,
    confidence: confidence(input),
    dataSources: input.dataSources,
    methodologyVersion: METHODOLOGY_VERSION,
  };
}
