import type { Metadata } from "next";
import Link from "next/link";
import { FileText } from "lucide-react";
import { getStore } from "@/lib/db";
import { formatDateTime, shortAddress } from "@/lib/format";
import { CHAINS } from "@/services/blockchain/chains";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { RiskBadge } from "@/components/shared";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage() {
  const reports = await getStore().listReports();
  return (
    <div>
      <PageHeader eyebrow="Audit trail" title="Reports" description="Compliance reports generated from wallet analyses. Open a report to view, print or export it as PDF." />
      <div className="container py-8">
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>Report ID</TH>
                <TH>Generated</TH>
                <TH>Wallet</TH>
                <TH>Blockchain</TH>
                <TH>Risk</TH>
                <TH>Data</TH>
                <TH className="text-right">Open</TH>
              </TR>
            </THead>
            <TBody>
              {reports.map((r) => (
                <TR key={r.id} className="hover:bg-muted/40">
                  <TD className="mono font-medium">{r.id}</TD>
                  <TD className="text-muted-foreground">{formatDateTime(r.createdAt)}</TD>
                  <TD className="mono">{shortAddress(r.address, 8, 6)}</TD>
                  <TD>{CHAINS[r.chain].name}</TD>
                  <TD>
                    <RiskBadge level={r.riskLevel} score={r.riskScore} />
                  </TD>
                  <TD>{r.dataMode === "demo" ? <Badge variant="demo">Demo</Badge> : <Badge variant="live">Live</Badge>}</TD>
                  <TD className="text-right">
                    <Link href={`/analysis/${r.chain}/${r.address}/report?id=${r.id}`} className="inline-flex items-center gap-1.5 text-accent hover:underline">
                      <FileText className="h-3.5 w-3.5" /> View
                    </Link>
                  </TD>
                </TR>
              ))}
              {reports.length === 0 ? (
                <TR>
                  <TD colSpan={7} className="py-14 text-center text-muted-foreground">
                    No reports yet. Open a wallet analysis and click “Generate Report”.
                  </TD>
                </TR>
              ) : null}
            </TBody>
          </Table>
        </Card>
        <p className="mt-3 text-[0.75rem] text-muted-foreground">
          Each report stores an immutable snapshot of the analysis it was generated from, so re-opening a report always shows the original findings.
        </p>
      </div>
    </div>
  );
}
