import "server-only";
import { Pool } from "pg";
import type { ActivityEvent, ChainKey, DataMode, EntityLabel, Investigation, ReportRecord, WalletAnalysis } from "@/types/domain";
import { addressKey } from "@/lib/addresses";
import type { DashboardStats, Store, WalletRecord } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */
const iso = (v: any) => (v instanceof Date ? v.toISOString() : String(v));

function toInvestigation(r: any): Investigation {
  return {
    id: r.id,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
    clientReference: r.client_reference,
    notes: r.notes,
    chain: r.chain,
    address: r.address,
    riskScore: Number(r.risk_score),
    riskLevel: r.risk_level,
    status: r.status,
    dataMode: r.data_mode,
  };
}

function toReport(r: any): ReportRecord {
  return {
    id: r.id,
    createdAt: iso(r.created_at),
    chain: r.chain,
    address: r.address,
    riskScore: Number(r.risk_score),
    riskLevel: r.risk_level,
    dataMode: r.data_mode,
    analysisGeneratedAt: iso(r.analysis_generated_at),
  };
}

/** PostgreSQL / Supabase store. Schema: supabase/migrations/0001_init.sql */
export class PostgresStore implements Store {
  readonly kind = "postgres" as const;
  private pool: Pool;

  constructor(connectionString: string, ssl: boolean) {
    this.pool = new Pool({ connectionString, ssl: ssl ? { rejectUnauthorized: false } : undefined, max: 5 });
  }

  async getCachedAnalysis(chain: ChainKey, address: string, mode: DataMode) {
    const { rows } = await this.pool.query("select analysis from analysis_cache where chain=$1 and address=$2 and data_mode=$3", [chain, address, mode]);
    return (rows[0]?.analysis as WalletAnalysis) ?? null;
  }

  async saveAnalysis(a: WalletAnalysis) {
    const c = await this.pool.connect();
    try {
      await c.query("begin");
      await c.query(
        `insert into analysis_cache (chain, address, data_mode, analysis, created_at) values ($1,$2,$3,$4,now())
         on conflict (chain, address, data_mode) do update set analysis=excluded.analysis, created_at=now()`,
        [a.chain, a.address, a.dataMode, JSON.stringify(a)],
      );
      await c.query(
        `insert into wallets (chain, address, last_analyzed_at, last_risk_score, last_risk_level, data_mode) values ($1,$2,$3,$4,$5,$6)
         on conflict (chain, address) do update set last_analyzed_at=excluded.last_analyzed_at, last_risk_score=excluded.last_risk_score,
           last_risk_level=excluded.last_risk_level, data_mode=excluded.data_mode`,
        [a.chain, a.address, a.generatedAt, a.risk.riskScore, a.risk.riskLevel, a.dataMode],
      );
      await c.query("delete from risk_indicators where chain=$1 and wallet=$2", [a.chain, a.address]);
      for (const i of a.risk.indicators) {
        await c.query(
          `insert into risk_indicators (chain, wallet, category, indicator_group, status, severity, score_contribution, description, evidence, source)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [a.chain, a.address, i.category, i.group, i.status, i.severity, i.scoreContribution, i.description, JSON.stringify(i.evidence), i.source],
        );
      }
      await c.query("commit");
    } catch (e) {
      await c.query("rollback");
      throw e;
    } finally {
      c.release();
    }
  }

  async listWallets(limit = 50): Promise<WalletRecord[]> {
    const { rows } = await this.pool.query("select * from wallets order by last_analyzed_at desc limit $1", [limit]);
    return rows.map((r) => ({
      chain: r.chain,
      address: r.address,
      lastAnalyzedAt: iso(r.last_analyzed_at),
      riskScore: Number(r.last_risk_score),
      riskLevel: r.last_risk_level,
      dataMode: r.data_mode,
    }));
  }

  async listInvestigations() {
    const { rows } = await this.pool.query("select * from investigations order by created_at desc");
    return rows.map(toInvestigation);
  }

  async getInvestigation(id: string) {
    const { rows } = await this.pool.query("select * from investigations where id=$1", [id]);
    return rows[0] ? toInvestigation(rows[0]) : null;
  }

  async createInvestigation(inv: Omit<Investigation, "id" | "createdAt" | "updatedAt">) {
    const { rows } = await this.pool.query(
      `insert into investigations (client_reference, notes, chain, address, risk_score, risk_level, status, data_mode)
       values ($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
      [inv.clientReference, inv.notes, inv.chain, inv.address, inv.riskScore, inv.riskLevel, inv.status, inv.dataMode],
    );
    return toInvestigation(rows[0]);
  }

  async updateInvestigation(id: string, patch: Partial<Pick<Investigation, "clientReference" | "notes" | "status">>) {
    const { rows } = await this.pool.query(
      `update investigations set
         client_reference = coalesce($2, client_reference),
         notes = coalesce($3, notes),
         status = coalesce($4, status),
         updated_at = now()
       where id=$1 returning *`,
      [id, patch.clientReference ?? null, patch.notes ?? null, patch.status ?? null],
    );
    return rows[0] ? toInvestigation(rows[0]) : null;
  }

  async deleteInvestigation(id: string) {
    const r = await this.pool.query("delete from investigations where id=$1", [id]);
    return (r.rowCount ?? 0) > 0;
  }

  async createReport(r: ReportRecord, snapshot: WalletAnalysis) {
    await this.pool.query(
      `insert into reports (id, created_at, chain, address, risk_score, risk_level, data_mode, analysis_generated_at, analysis_snapshot)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [r.id, r.createdAt, r.chain, r.address, r.riskScore, r.riskLevel, r.dataMode, r.analysisGeneratedAt, JSON.stringify(snapshot)],
    );
    return r;
  }

  async getReportSnapshot(id: string) {
    const { rows } = await this.pool.query("select analysis_snapshot from reports where id=$1", [id]);
    return (rows[0]?.analysis_snapshot as WalletAnalysis) ?? null;
  }

  async getReport(id: string) {
    const { rows } = await this.pool.query("select * from reports where id=$1", [id]);
    return rows[0] ? toReport(rows[0]) : null;
  }

  async listReports(limit = 100) {
    const { rows } = await this.pool.query("select * from reports order by created_at desc limit $1", [limit]);
    return rows.map(toReport);
  }

  async logActivity(ev: Omit<ActivityEvent, "id" | "at">) {
    await this.pool.query("insert into activity_log (type, message, chain, address) values ($1,$2,$3,$4)", [ev.type, ev.message, ev.chain ?? null, ev.address ?? null]);
  }

  async listActivity(limit = 20): Promise<ActivityEvent[]> {
    const { rows } = await this.pool.query("select * from activity_log order by at desc limit $1", [limit]);
    return rows.map((r) => ({ id: r.id, at: iso(r.at), type: r.type, message: r.message, chain: r.chain ?? undefined, address: r.address ?? undefined }));
  }

  async listCustomEntities(): Promise<EntityLabel[]> {
    const { rows } = await this.pool.query("select * from entities");
    return rows.map((r) => ({
      address: addressKey(String(r.address)),
      chain: r.chain,
      entityName: r.entity_name,
      entityType: r.entity_type,
      source: r.source,
      confidence: Number(r.confidence),
      lastUpdated: iso(r.last_updated),
      reference: r.reference ?? undefined,
    }));
  }

  async stats(): Promise<DashboardStats> {
    const { rows } = await this.pool.query(`select
      (select count(*) from wallets) as wallets,
      (select count(*) from investigations where risk_score > 60 or status = 'Escalated') as high_risk,
      (select count(*) from reports) as reports,
      (select count(*) from investigations where status in ('New','Reviewing')) as open`);
    const r = rows[0];
    return {
      walletsAnalyzed: Number(r.wallets),
      highRiskReviews: Number(r.high_risk),
      reportsGenerated: Number(r.reports),
      openInvestigations: Number(r.open),
    };
  }
}
