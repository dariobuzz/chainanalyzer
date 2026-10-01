import type { WalletAnalysis } from "@/types/domain";
import { formatAmount, formatDate, formatNumber, formatUsd } from "@/lib/format";
import { Card } from "@/components/ui/card";

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card px-4 py-3.5 shadow-card">
      <p className="eyebrow">{label}</p>
      <p className="mt-1.5 text-[1.25rem] font-semibold tracking-tight text-navy-900 tabular">{value}</p>
      {sub ? <p className="mt-0.5 text-[0.75rem] text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

export function OverviewCards({ analysis }: { analysis: WalletAnalysis }) {
  const o = analysis.overview;
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat
          label="Native Balance"
          value={o.nativeBalance === null ? "—" : `${formatAmount(o.nativeBalance)} ${o.nativeSymbol}`}
          sub={o.nativeBalanceUsd !== null ? formatUsd(o.nativeBalanceUsd) : "Balance unavailable"}
        />
        <Stat label="Estimated Portfolio Value" value={formatUsd(o.portfolioUsd)} sub={o.portfolioNote} />
        <Stat label="Unique Counterparties" value={formatNumber(o.uniqueCounterparties)} sub="Distinct addresses" />
        <Stat label="First Activity" value={formatDate(o.firstActivity)} sub={analysis.behavior.walletAgeDays !== null ? `${formatNumber(analysis.behavior.walletAgeDays)} days ago` : "—"} />
        <Stat label="Last Activity" value={formatDate(o.lastActivity)} />
        <Stat
          label="Total Transactions"
          value={`${o.totalTransactions.isLowerBound ? "≥ " : ""}${formatNumber(o.totalTransactions.value)}`}
          sub={o.totalTransactions.isLowerBound ? "Provider limit reached" : "Observed on-chain"}
        />
        <Stat label="Transactions Analyzed" value={formatNumber(o.transactionsAnalyzed)} sub={`${formatNumber(analysis.transfers.length)} transfers loaded`} />
        <Stat label="Total Incoming" value={formatUsd(o.totalIncomingUsd, { compact: true })} sub="Priced transfers" />
        <Stat label="Total Outgoing" value={formatUsd(o.totalOutgoingUsd, { compact: true })} sub={o.unpricedTransfers ? `${formatNumber(o.unpricedTransfers)} unpriced transfers excluded` : "Priced transfers"} />
      </div>
      <Card className="flex-1 px-4 py-3.5">
        <div className="flex items-center justify-between">
          <p className="eyebrow">Main tokens held or moved</p>
          <p className="text-[0.6875rem] text-muted-foreground">by USD volume</p>
        </div>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {o.holdings.map((h) => (
            <span key={`h-${h.asset.contract}`} className="inline-flex items-center gap-1.5 rounded-md border border-accent/30 bg-accent/5 px-2 py-1 text-[0.75rem]">
              <span className="font-semibold">{h.asset.symbol}</span>
              <span className="text-muted-foreground">held {formatAmount(h.balance, 2)}</span>
            </span>
          ))}
          {o.topAssetsMoved.map((a) => (
            <span key={`m-${a.contract ?? "native"}`} className="inline-flex items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-1 text-[0.75rem]">
              <span className="font-semibold">{a.symbol}</span>
              <span className="text-muted-foreground">
                {formatNumber(a.transfers)} transfers · {a.usdVolume === null ? "unpriced" : formatUsd(a.usdVolume, { compact: true })}
              </span>
            </span>
          ))}
          {o.topAssetsMoved.length === 0 && o.holdings.length === 0 ? <span className="text-[0.8125rem] text-muted-foreground">No token activity observed.</span> : null}
        </div>
      </Card>
    </div>
  );
}
