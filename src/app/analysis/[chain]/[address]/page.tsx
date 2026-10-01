import type { Metadata } from "next";
import { addressSchema, chainSchema } from "@/lib/validation";
import { PublicError } from "@/lib/security/errors";
import { shortAddress } from "@/lib/format";
import { getWalletAnalysis } from "@/services/analysis/analyze";
import { AnalysisHeader } from "@/components/analysis/analysis-header";
import { SectionNav } from "@/components/analysis/section-nav";
import { RiskScoreCard } from "@/components/analysis/risk-score-card";
import { OverviewCards } from "@/components/analysis/overview-cards";
import { SummaryCard } from "@/components/analysis/summary-card";
import { FundsBreakdown } from "@/components/analysis/funds-breakdown";
import { ActivityChart } from "@/components/analysis/activity-chart";
import { FundFlowCard } from "@/components/analysis/fund-flow-graph";
import { RiskIndicators } from "@/components/analysis/risk-indicators";
import { CounterpartyTable } from "@/components/analysis/counterparty-table";
import { TransactionTable } from "@/components/analysis/transaction-table";
import { BehaviorPanel } from "@/components/analysis/behavior-panel";
import { DataSourcesCard } from "@/components/analysis/data-sources";
import { AnalysisError } from "@/components/analysis/analysis-error";
import { DISCLAIMER } from "@/lib/constants";

export const dynamic = "force-dynamic";

type Params = { chain: string; address: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const p = await params;
  return { title: `Wallet Analysis ${shortAddress(p.address)}` };
}

function Section({ id, title, children }: { id: string; title?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-32">
      {title ? <h2 className="mb-3 text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{title}</h2> : null}
      {children}
    </section>
  );
}

export default async function AnalysisPage({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<{ refresh?: string }> }) {
  const p = await params;
  const sp = await searchParams;
  const chain = chainSchema.safeParse(p.chain);
  const address = addressSchema.safeParse(p.address);
  if (!chain.success) return <AnalysisError title="Unsupported blockchain" message={`"${p.chain}" is not supported. Choose Ethereum, Base or BNB Chain.`} />;
  if (!address.success) return <AnalysisError title="Invalid wallet address" message="Expected an EVM address: 0x followed by 40 hexadecimal characters." />;

  let analysis;
  try {
    analysis = await getWalletAnalysis(chain.data, address.data, { refresh: sp.refresh === "1" });
  } catch (e) {
    const msg = e instanceof PublicError ? e.message : "The analysis could not be completed. Please retry in a moment.";
    if (!(e instanceof PublicError)) console.error("[chainscope] analysis failed", e);
    return <AnalysisError title="Analysis unavailable" message={msg} retry />;
  }

  return (
    <div>
      <AnalysisHeader analysis={analysis} />
      <SectionNav />
      <div className="container space-y-8 py-8">
        <Section id="overview">
          <div className="grid gap-4 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <RiskScoreCard analysis={analysis} />
            </div>
            <div className="lg:col-span-8">
              <OverviewCards analysis={analysis} />
            </div>
          </div>
          <div className="mt-4">
            <SummaryCard analysis={analysis} />
          </div>
        </Section>

        <Section id="funds" title="Source & Destination of Funds">
          <FundsBreakdown flows={analysis.flows} />
          <div className="mt-4">
            <ActivityChart data={analysis.monthly} />
          </div>
        </Section>

        <Section id="flow" title="Fund Flow">
          <FundFlowCard graph={analysis.graph} counterparties={analysis.counterparties} transfers={analysis.transfers} chain={analysis.chain} />
        </Section>

        <Section id="indicators" title="Risk Indicators">
          <RiskIndicators indicators={analysis.risk.indicators} />
        </Section>

        <Section id="counterparties" title="Counterparties">
          <CounterpartyTable counterparties={analysis.counterparties} transfers={analysis.transfers} chain={analysis.chain} />
        </Section>

        <Section id="transactions" title="Transactions">
          <TransactionTable
            transfers={analysis.transfers}
            counterparties={analysis.counterparties}
            chain={analysis.chain}
            totalAnalyzed={analysis.overview.transactionsAnalyzed}
            demo={analysis.dataMode === "demo"}
          />
        </Section>

        <Section id="behavior" title="Behavioral Analysis">
          <BehaviorPanel behavior={analysis.behavior} />
        </Section>

        <Section id="sources" title="Data Sources">
          <DataSourcesCard analysis={analysis} />
        </Section>

        <p className="rounded-lg border bg-card px-5 py-4 text-[0.75rem] leading-relaxed text-muted-foreground">{DISCLAIMER}</p>
      </div>
    </div>
  );
}
