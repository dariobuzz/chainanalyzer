import type { Metadata } from "next";
import Link from "next/link";
import { Activity, AlertOctagon, FileText, FolderOpen, ScanSearch, Wallet } from "lucide-react";
import { getStore } from "@/lib/db";
import { config } from "@/lib/config";
import { formatDateTime, shortAddress, timeAgo } from "@/lib/format";
import { CHAINS } from "@/services/blockchain/chains";
import { PageHeader } from "@/components/layout/page-header";
import { AnalyzeForm } from "@/components/analyze/analyze-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { RiskBadge } from "@/components/shared";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Dashboard" };

const ACTIVITY_ICON = { analysis: ScanSearch, report: FileText, investigation_created: FolderOpen, investigation_updated: Activity } as const;

export default async function DashboardPage() {
  const store = getStore();
  const [stats, investigations, activity, wallets] = await Promise.all([store.stats(), store.listInvestigations(), store.listActivity(12), store.listWallets(8)]);

  const kpis = [
    { label: "Wallets Analyzed", value: stats.walletsAnalyzed, icon: Wallet, hint: "Distinct wallets" },
    { label: "Open Investigations", value: stats.openInvestigations, icon: FolderOpen, hint: "New or reviewing" },
    { label: "High Risk Reviews", value: stats.highRiskReviews, icon: AlertOctagon, hint: "Score > 60 or escalated" },
    { label: "Reports Generated", value: stats.reportsGenerated, icon: FileText, hint: "Compliance reports" },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Overview"
        title="Dashboard"
        description="Recent activity across wallet analyses, investigations and reports."
        actions={config.demoMode ? <Badge variant="demo">Demo Mode active</Badge> : <Badge variant="live">Live data</Badge>}
      />
      <div className="container space-y-6 py-8">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {kpis.map((k) => (
            <Card key={k.label} className="p-5">
              <div className="flex items-center justify-between">
                <p className="eyebrow">{k.label}</p>
                <k.icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-navy-900 tabular">{k.value}</p>
              <p className="mt-0.5 text-[0.75rem] text-muted-foreground">{k.hint}</p>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Quick Analyze Wallet</CardTitle>
            <CardDescription>Enter an address to run a new analysis.</CardDescription>
          </CardHeader>
          <CardContent>
            <AnalyzeForm size="sm" />
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader className="flex-row items-center justify-between border-b pb-4">
              <CardTitle>Recent Investigations</CardTitle>
              <Link href="/investigations" className="text-[0.8125rem] text-accent hover:underline">
                View all
              </Link>
            </CardHeader>
            <Table>
              <THead>
                <TR>
                  <TH>Date</TH>
                  <TH>Reference</TH>
                  <TH>Wallet</TH>
                  <TH>Risk</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {investigations.slice(0, 6).map((i) => (
                  <TR key={i.id}>
                    <TD className="whitespace-nowrap text-muted-foreground">{formatDateTime(i.createdAt).replace(" UTC", "")}</TD>
                    <TD className="font-medium">{i.clientReference || "—"}</TD>
                    <TD>
                      <Link href={`/analysis/${i.chain}/${i.address}`} className="mono text-accent hover:underline">
                        {shortAddress(i.address)}
                      </Link>
                    </TD>
                    <TD>
                      <RiskBadge level={i.riskLevel} score={i.riskScore} />
                    </TD>
                    <TD>{i.status}</TD>
                  </TR>
                ))}
                {investigations.length === 0 ? (
                  <TR>
                    <TD colSpan={5} className="py-10 text-center text-muted-foreground">
                      No investigations yet.
                    </TD>
                  </TR>
                ) : null}
              </TBody>
            </Table>
          </Card>

          <Card>
            <CardHeader className="border-b pb-4">
              <CardTitle>Recent Activity</CardTitle>
            </CardHeader>
            <ul className="divide-y">
              {activity.map((a) => {
                const Icon = ACTIVITY_ICON[a.type] ?? Activity;
                const body = (
                  <div className="flex gap-3 px-5 py-3">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="text-[0.8125rem]">{a.message}</p>
                      <p className="text-[0.6875rem] text-muted-foreground">
                        {a.address ? <span className="mono">{shortAddress(a.address)} · </span> : null}
                        {timeAgo(a.at)}
                      </p>
                    </div>
                  </div>
                );
                return (
                  <li key={a.id} className="hover:bg-muted/40">
                    {a.chain && a.address ? <Link href={`/analysis/${a.chain}/${a.address}`}>{body}</Link> : body}
                  </li>
                );
              })}
              {activity.length === 0 ? <li className="px-5 py-10 text-center text-[0.8125rem] text-muted-foreground">No activity yet.</li> : null}
            </ul>
          </Card>
        </div>

        <Card>
          <CardHeader className="border-b pb-4">
            <CardTitle>Recently analyzed wallets</CardTitle>
          </CardHeader>
          <Table>
            <THead>
              <TR>
                <TH>Wallet</TH>
                <TH>Blockchain</TH>
                <TH>Risk</TH>
                <TH>Data</TH>
                <TH>Last analyzed</TH>
              </TR>
            </THead>
            <TBody>
              {wallets.map((w) => (
                <TR key={`${w.chain}:${w.address}`}>
                  <TD>
                    <Link href={`/analysis/${w.chain}/${w.address}`} className="mono text-accent hover:underline">
                      {shortAddress(w.address, 10, 8)}
                    </Link>
                  </TD>
                  <TD>{CHAINS[w.chain].name}</TD>
                  <TD>
                    <RiskBadge level={w.riskLevel} score={w.riskScore} />
                  </TD>
                  <TD>{w.dataMode === "demo" ? <Badge variant="demo">Demo</Badge> : <Badge variant="live">Live</Badge>}</TD>
                  <TD className="text-muted-foreground">{timeAgo(w.lastAnalyzedAt)}</TD>
                </TR>
              ))}
              {wallets.length === 0 ? (
                <TR>
                  <TD colSpan={5} className="py-10 text-center text-muted-foreground">
                    No wallets analyzed yet.
                  </TD>
                </TR>
              ) : null}
            </TBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
