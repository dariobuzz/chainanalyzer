/**
 * ChainScope domain model.
 * Every analysis artefact (counterparties, flows, risk) is derived from these
 * normalized, provider-independent structures.
 */

export type ChainKey = "ethereum" | "base" | "bsc" | "bitcoin" | "tron" | "solana";
export type FutureChainKey = "polygon" | "arbitrum";
/** Address format / data model family. */
export type ChainFamily = "evm" | "utxo" | "tron" | "solana";

export type DataMode = "live" | "demo";
export type Direction = "in" | "out" | "self";

export type EntityType =
  | "cex"
  | "dex"
  | "bridge"
  | "mixer"
  | "token_contract"
  | "smart_contract"
  | "known_entity"
  | "gambling"
  | "darknet"
  | "scam"
  | "ransomware"
  | "stolen_funds"
  | "high_risk_exchange"
  | "unlicensed_service"
  | "illicit_activity"
  | "sanctioned"
  | "unknown_wallet";

export interface Asset {
  symbol: string;
  name?: string;
  /** Token contract / mint (canonical address form) or null for the native asset. */
  contract: string | null;
  decimals: number;
  kind: "native" | "token";
}

export interface Transfer {
  id: string;
  hash: string;
  /** Unix epoch milliseconds. */
  timestamp: number;
  blockNumber: number;
  from: string;
  to: string;
  direction: Direction;
  /** The other side of the transfer, from the analyzed wallet's perspective. */
  counterparty: string;
  asset: Asset;
  amount: number;
  usdValue: number | null;
  /** native = top-level value transfer, token = ERC-20/BEP-20/TRC-20/SPL transfer, internal = contract-originated native transfer */
  kind: "native" | "token" | "internal";
  method: string | null;
  isError: boolean;
  feeNative: number | null;
}

export interface EntityLabel {
  address: string;
  chain: ChainKey | "evm";
  entityName: string;
  entityType: EntityType;
  source: string;
  /** 0..1 */
  confidence: number;
  lastUpdated: string;
  reference?: string;
  demo?: boolean;
}

export interface SanctionMatch {
  address: string;
  entity: string;
  program: string;
  source: string;
  sourceUrl: string;
  /** Date of the dataset snapshot or listing date. */
  date: string;
  reference: string;
  demo?: boolean;
}

export interface TokenHolding {
  asset: Asset;
  balance: number;
  usdValue: number | null;
}

export interface CountValue {
  value: number;
  /** True when the provider limit was reached: the real figure is at least `value`. */
  isLowerBound: boolean;
}

export interface WalletOverview {
  nativeSymbol: string;
  nativeBalance: number | null;
  nativeBalanceUsd: number | null;
  portfolioUsd: number | null;
  portfolioNote: string;
  holdings: TokenHolding[];
  topAssetsMoved: { symbol: string; contract: string | null; transfers: number; usdVolume: number | null }[];
  firstActivity: number | null;
  lastActivity: number | null;
  totalTransactions: CountValue;
  transactionsAnalyzed: number;
  totalIncomingUsd: number;
  totalOutgoingUsd: number;
  unpricedTransfers: number;
  uniqueCounterparties: number;
  isContract: boolean | null;
}

export interface Counterparty {
  address: string;
  label: EntityLabel | null;
  type: EntityType;
  displayName: string;
  isContract: boolean | null;
  incomingUsd: number;
  outgoingUsd: number;
  incomingCount: number;
  outgoingCount: number;
  txCount: number;
  /** Share of the wallet's total priced volume (in + out), 0..100. */
  exposurePct: number;
  firstInteraction: number;
  lastInteraction: number;
  assets: string[];
  sanction: SanctionMatch | null;
  riskTags: RiskCategory[];
}

export interface FlowBucket {
  key: string;
  label: string;
  type: EntityType | "other";
  usd: number;
  pct: number;
  addresses: number;
}

export interface FundFlows {
  sources: FlowBucket[];
  destinations: FlowBucket[];
  totalIncomingUsd: number;
  totalOutgoingUsd: number;
}

export interface MonthlyActivity {
  month: string; // YYYY-MM
  incomingUsd: number;
  outgoingUsd: number;
  txCount: number;
}

export interface BehaviorMetric {
  key: string;
  label: string;
  value: string;
  detail: string;
  flag: "neutral" | "notice" | "elevated";
}

export interface BehaviorAnalysis {
  walletAgeDays: number | null;
  activeDays: number;
  txPerActiveDay: number;
  avgTransferUsd: number | null;
  largestTransfer: { usd: number; hash: string; direction: Direction } | null;
  rapidMovementPct: number | null;
  incomingTopSharePct: number | null;
  outgoingTopSharePct: number | null;
  contractInteractionPct: number;
  bridgeUsagePct: number;
  dexUsagePct: number;
  structuringCandidates: number;
  metrics: BehaviorMetric[];
}

// ── Risk ────────────────────────────────────────────────────────────────────

export type RiskCategory =
  | "sanctioned_address"
  | "known_scam"
  | "stolen_funds"
  | "mixer_exposure"
  | "darknet_exposure"
  | "ransomware"
  | "high_risk_exchange"
  | "unlicensed_service"
  | "gambling"
  | "illicit_activity"
  | "third_party_risk_score"
  | "bridge_exposure"
  | "dex_exposure"
  | "high_velocity"
  | "recently_created"
  | "unusual_pattern";

export type RiskLevel = "Low" | "Low/Moderate" | "Moderate" | "High" | "Very High";
export type Severity = "info" | "low" | "medium" | "high" | "critical";
export type IndicatorGroup = "verified_intelligence" | "behavioral";
export type IndicatorStatus = "detected" | "not_detected" | "no_verified_intelligence" | "insufficient_data";

export interface RiskFactor {
  category: RiskCategory;
  severity: Severity;
  scoreContribution: number;
  description: string;
  evidence: string[];
  source: string;
}

export interface RiskIndicator extends Omit<RiskFactor, "severity"> {
  label: string;
  group: IndicatorGroup;
  status: IndicatorStatus;
  severity: Severity | null;
}

export interface DataSource {
  name: string;
  kind: "blockchain" | "sanctions" | "entity_labels" | "risk_score" | "pricing" | "demo";
  detail: string;
  url?: string;
  asOf?: string;
}

export interface RiskAssessment {
  riskScore: number;
  riskLevel: RiskLevel;
  riskFactors: RiskFactor[];
  indicators: RiskIndicator[];
  confidence: { level: "Low" | "Medium" | "High"; score: number; reasons: string[] };
  dataSources: DataSource[];
  methodologyVersion: string;
}

// ── Graph ───────────────────────────────────────────────────────────────────

export type GraphNodeKind = "subject" | EntityType | "other";

export interface FlowGraphNode {
  id: string;
  address: string | null;
  label: string;
  kind: GraphNodeKind;
  hop: number;
  incomingUsd: number;
  outgoingUsd: number;
  txCount: number;
  riskTags: RiskCategory[];
  sanctioned: boolean;
  /** "Other" aggregate nodes carry the number of addresses they group. */
  groupedCount?: number;
}

export interface FlowGraphEdge {
  id: string;
  source: string;
  target: string;
  usd: number;
  txCount: number;
}

export interface FlowGraph {
  depth: number;
  maxSupportedDepth: number;
  nodes: FlowGraphNode[];
  edges: FlowGraphEdge[];
  omittedCounterparties: number;
}

// ── Analysis ────────────────────────────────────────────────────────────────

export interface WalletAnalysis {
  id: string;
  chain: ChainKey;
  address: string;
  generatedAt: string;
  dataMode: DataMode;
  demoProfile?: string;
  overview: WalletOverview;
  /** Most recent transfers (bounded for payload size). */
  transfers: Transfer[];
  counterparties: Counterparty[];
  flows: FundFlows;
  monthly: MonthlyActivity[];
  graph: FlowGraph;
  behavior: BehaviorAnalysis;
  risk: RiskAssessment;
  subjectSanction: SanctionMatch | null;
  subjectLabel: EntityLabel | null;
  summary: string[];
  warnings: string[];
  pricing: { nativeUsd: number | null; source: string; asOf: string; note: string };
}

// ── Investigations & reports ────────────────────────────────────────────────

export type InvestigationStatus = "New" | "Reviewing" | "Cleared" | "Escalated";

export interface Investigation {
  id: string;
  createdAt: string;
  updatedAt: string;
  clientReference: string;
  notes: string;
  chain: ChainKey;
  address: string;
  riskScore: number;
  riskLevel: RiskLevel;
  status: InvestigationStatus;
  dataMode: DataMode;
}

export interface ReportRecord {
  id: string;
  createdAt: string;
  chain: ChainKey;
  address: string;
  riskScore: number;
  riskLevel: RiskLevel;
  dataMode: DataMode;
  analysisGeneratedAt: string;
}

export interface ActivityEvent {
  id: string;
  at: string;
  type: "analysis" | "report" | "investigation_created" | "investigation_updated";
  message: string;
  chain?: ChainKey;
  address?: string;
}
