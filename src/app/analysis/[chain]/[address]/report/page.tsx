import type { Metadata } from "next";
import { addressSchema, chainSchema } from "@/lib/validation";
import { PublicError } from "@/lib/security/errors";
import { getStore } from "@/lib/db";
import { getWalletAnalysis } from "@/services/analysis/analyze";
import { ReportDocument } from "@/components/report/report-document";
import { ReportToolbar } from "@/components/report/report-toolbar";
import { AnalysisError } from "@/components/analysis/analysis-error";

export const dynamic = "force-dynamic";

type Params = { chain: string; address: string };

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ id?: string }> }): Promise<Metadata> {
  const sp = await searchParams;
  return { title: sp.id ? `Report ${sp.id}` : "Report preview" };
}

export default async function ReportPage({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<{ id?: string }> }) {
  const p = await params;
  const sp = await searchParams;
  const chain = chainSchema.safeParse(p.chain);
  const address = addressSchema.safeParse(p.address);
  if (!chain.success || !address.success) return <AnalysisError title="Invalid report request" message="Unsupported blockchain or invalid wallet address." />;

  const reportId = typeof sp.id === "string" && /^CS-\d{8}-[A-F0-9]{6}$/.test(sp.id) ? sp.id : null;
  let report = reportId ? await getStore().getReport(reportId).catch(() => null) : null;
  if (report && (report.chain !== chain.data || report.address !== address.data)) report = null;

  try {
    // Registered reports render their immutable snapshot; previews use the current (cached) analysis.
    const snapshot = report ? await getStore().getReportSnapshot(report.id).catch(() => null) : null;
    const analysis = snapshot ?? (await getWalletAnalysis(chain.data, address.data));
    return (
      <div className="bg-muted/40 print:bg-white">
        <ReportToolbar backHref={`/analysis/${chain.data}/${address.data}`} registered={Boolean(report)} />
        <ReportDocument analysis={analysis} report={report} />
      </div>
    );
  } catch (e) {
    return <AnalysisError title="Report unavailable" message={e instanceof PublicError ? e.message : "The analysis could not be completed."} retry />;
  }
}
