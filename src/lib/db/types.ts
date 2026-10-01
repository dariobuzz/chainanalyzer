import type {
  ActivityEvent,
  ChainKey,
  DataMode,
  EntityLabel,
  Investigation,
  InvestigationStatus,
  ReportRecord,
  RiskLevel,
  WalletAnalysis,
} from "@/types/domain";

export interface WalletRecord {
  chain: ChainKey;
  address: string;
  lastAnalyzedAt: string;
  riskScore: number;
  riskLevel: RiskLevel;
  dataMode: DataMode;
}

export interface DashboardStats {
  walletsAnalyzed: number;
  highRiskReviews: number;
  reportsGenerated: number;
  openInvestigations: number;
}

/**
 * Persistence abstraction. Implementations: local JSON files (zero-config
 * default) and PostgreSQL/Supabase (when DATABASE_URL is set).
 */
export interface Store {
  readonly kind: "file" | "postgres";

  getCachedAnalysis(chain: ChainKey, address: string, mode: DataMode): Promise<WalletAnalysis | null>;
  saveAnalysis(analysis: WalletAnalysis): Promise<void>;
  listWallets(limit?: number): Promise<WalletRecord[]>;

  listInvestigations(): Promise<Investigation[]>;
  getInvestigation(id: string): Promise<Investigation | null>;
  createInvestigation(inv: Omit<Investigation, "id" | "createdAt" | "updatedAt">): Promise<Investigation>;
  updateInvestigation(id: string, patch: Partial<Pick<Investigation, "clientReference" | "notes" | "status">>): Promise<Investigation | null>;
  deleteInvestigation(id: string): Promise<boolean>;

  /** Persists the report record together with an immutable snapshot of the analysis it was generated from. */
  createReport(r: ReportRecord, snapshot: WalletAnalysis): Promise<ReportRecord>;
  getReportSnapshot(id: string): Promise<WalletAnalysis | null>;
  getReport(id: string): Promise<ReportRecord | null>;
  listReports(limit?: number): Promise<ReportRecord[]>;

  logActivity(ev: Omit<ActivityEvent, "id" | "at">): Promise<void>;
  listActivity(limit?: number): Promise<ActivityEvent[]>;

  listCustomEntities(): Promise<EntityLabel[]>;
  stats(): Promise<DashboardStats>;
}

export type { InvestigationStatus };
