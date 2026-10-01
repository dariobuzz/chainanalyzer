import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { ActivityEvent, ChainKey, DataMode, EntityLabel, Investigation, ReportRecord, WalletAnalysis } from "@/types/domain";
import type { DashboardStats, Store, WalletRecord } from "./types";

interface FileData {
  wallets: WalletRecord[];
  investigations: Investigation[];
  reports: ReportRecord[];
  activity: ActivityEvent[];
  entities: EntityLabel[];
}

const ROOT = path.join(process.cwd(), "data", "runtime");
const DB_FILE = path.join(ROOT, "store.json");
const CACHE_DIR = path.join(ROOT, "cache");
const REPORT_DIR = path.join(ROOT, "reports");
const empty = (): FileData => ({ wallets: [], investigations: [], reports: [], activity: [], entities: [] });

/**
 * Zero-configuration local store (single-process). Writes are serialized and
 * atomic (tmp file + rename). Suitable for demos and local evaluation only.
 */
export class FileStore implements Store {
  readonly kind = "file" as const;
  private data: FileData | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  private async load(): Promise<FileData> {
    if (this.data) return this.data;
    try {
      this.data = { ...empty(), ...JSON.parse(await fs.readFile(DB_FILE, "utf8")) };
    } catch {
      this.data = empty();
    }
    return this.data!;
  }

  private mutate<T>(fn: (d: FileData) => T): Promise<T> {
    const run = this.queue.then(async () => {
      const d = await this.load();
      const result = fn(d);
      await fs.mkdir(ROOT, { recursive: true });
      const tmp = `${DB_FILE}.${process.pid}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(d, null, 1));
      await fs.rename(tmp, DB_FILE);
      return result;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  private cacheFile(chain: ChainKey, address: string, mode: DataMode) {
    // Base58 addresses are case-sensitive but Windows/macOS file names are not: hash the canonical address.
    const key = createHash("sha256").update(address).digest("hex").slice(0, 32);
    return path.join(CACHE_DIR, `${mode}-${chain}-${key}.json`);
  }

  async getCachedAnalysis(chain: ChainKey, address: string, mode: DataMode) {
    try {
      return JSON.parse(await fs.readFile(this.cacheFile(chain, address, mode), "utf8")) as WalletAnalysis;
    } catch {
      return null;
    }
  }

  async saveAnalysis(a: WalletAnalysis) {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(this.cacheFile(a.chain, a.address, a.dataMode), JSON.stringify(a));
    await this.mutate((d) => {
      d.wallets = d.wallets.filter((w) => !(w.chain === a.chain && w.address === a.address));
      d.wallets.unshift({
        chain: a.chain,
        address: a.address,
        lastAnalyzedAt: a.generatedAt,
        riskScore: a.risk.riskScore,
        riskLevel: a.risk.riskLevel,
        dataMode: a.dataMode,
      });
    });
  }

  async listWallets(limit = 50) {
    return (await this.load()).wallets.slice(0, limit);
  }

  async listInvestigations() {
    return [...(await this.load()).investigations].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getInvestigation(id: string) {
    return (await this.load()).investigations.find((i) => i.id === id) ?? null;
  }

  async createInvestigation(inv: Omit<Investigation, "id" | "createdAt" | "updatedAt">) {
    const now = new Date().toISOString();
    const rec: Investigation = { ...inv, id: randomUUID(), createdAt: now, updatedAt: now };
    await this.mutate((d) => d.investigations.push(rec));
    return rec;
  }

  async updateInvestigation(id: string, patch: Partial<Pick<Investigation, "clientReference" | "notes" | "status">>) {
    return this.mutate((d) => {
      const i = d.investigations.find((x) => x.id === id);
      if (!i) return null;
      Object.assign(i, patch, { updatedAt: new Date().toISOString() });
      return { ...i };
    });
  }

  async deleteInvestigation(id: string) {
    return this.mutate((d) => {
      const before = d.investigations.length;
      d.investigations = d.investigations.filter((i) => i.id !== id);
      return d.investigations.length < before;
    });
  }

  async createReport(r: ReportRecord, snapshot: WalletAnalysis) {
    await fs.mkdir(REPORT_DIR, { recursive: true });
    await fs.writeFile(path.join(REPORT_DIR, `${r.id}.json`), JSON.stringify(snapshot));
    await this.mutate((d) => d.reports.unshift(r));
    return r;
  }

  async getReportSnapshot(id: string) {
    if (!/^CS-\d{8}-[A-F0-9]{6}$/.test(id)) return null;
    try {
      return JSON.parse(await fs.readFile(path.join(REPORT_DIR, `${id}.json`), "utf8")) as WalletAnalysis;
    } catch {
      return null;
    }
  }

  async getReport(id: string) {
    return (await this.load()).reports.find((r) => r.id === id) ?? null;
  }

  async listReports(limit = 100) {
    return (await this.load()).reports.slice(0, limit);
  }

  async logActivity(ev: Omit<ActivityEvent, "id" | "at">) {
    await this.mutate((d) => {
      d.activity.unshift({ ...ev, id: randomUUID(), at: new Date().toISOString() });
      d.activity = d.activity.slice(0, 500);
    });
  }

  async listActivity(limit = 20) {
    return (await this.load()).activity.slice(0, limit);
  }

  async listCustomEntities() {
    return (await this.load()).entities;
  }

  async stats(): Promise<DashboardStats> {
    const d = await this.load();
    return {
      walletsAnalyzed: d.wallets.length,
      highRiskReviews: d.investigations.filter((i) => i.riskScore > 60 || i.status === "Escalated").length,
      reportsGenerated: d.reports.length,
      openInvestigations: d.investigations.filter((i) => i.status === "New" || i.status === "Reviewing").length,
    };
  }
}
