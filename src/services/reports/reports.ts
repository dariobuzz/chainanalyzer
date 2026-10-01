import "server-only";
import { randomBytes } from "node:crypto";
import type { ReportRecord, WalletAnalysis } from "@/types/domain";
import { getStore } from "@/lib/db";
import { CHAINS } from "@/services/blockchain/chains";

export function newReportId(date = new Date()): string {
  const d = date.toISOString().slice(0, 10).replace(/-/g, "");
  return `CS-${d}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

/** Registers a report for an analysis (audit trail of generated reports). */
export async function registerReport(a: WalletAnalysis): Promise<ReportRecord> {
  const store = getStore();
  const rec: ReportRecord = {
    id: newReportId(),
    createdAt: new Date().toISOString(),
    chain: a.chain,
    address: a.address,
    riskScore: a.risk.riskScore,
    riskLevel: a.risk.riskLevel,
    dataMode: a.dataMode,
    analysisGeneratedAt: a.generatedAt,
  };
  await store.createReport(rec, a);
  await store
    .logActivity({ type: "report", message: `Compliance report ${rec.id} generated (${CHAINS[a.chain].name})`, chain: a.chain, address: a.address })
    .catch(() => undefined);
  return rec;
}
