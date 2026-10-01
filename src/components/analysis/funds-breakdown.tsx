import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import type { FlowBucket, FundFlows } from "@/types/domain";
import { ENTITY_TYPE_LABEL } from "@/lib/constants";
import { formatPct, formatUsd } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const RISKY = new Set(["mixer", "darknet", "scam", "ransomware", "stolen_funds", "sanctioned", "high_risk_exchange", "unlicensed_service", "gambling"]);

function Breakdown({ buckets, color, empty }: { buckets: FlowBucket[]; color: string; empty: string }) {
  if (!buckets.length) return <p className="py-6 text-center text-[0.8125rem] text-muted-foreground">{empty}</p>;
  return (
    <ul className="space-y-3">
      {buckets.map((b) => (
        <li key={b.key} title={`${b.label}: ${formatUsd(b.usd)} (${formatPct(b.pct)}) across ${b.addresses} address${b.addresses === 1 ? "" : "es"}`}>
          <div className="flex items-baseline justify-between gap-3 text-[0.8125rem]">
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate font-medium">{b.label}</span>
              <span className="shrink-0 text-[0.6875rem] text-muted-foreground">
                {b.type === "other" ? `${b.addresses} addresses` : ENTITY_TYPE_LABEL[b.type]}
              </span>
              {RISKY.has(b.type) ? <span className="shrink-0 rounded bg-risk-veryhigh-bg px-1.5 text-[0.625rem] font-semibold uppercase text-risk-veryhigh">Risk</span> : null}
            </span>
            <span className="shrink-0 tabular">
              <span className="font-semibold">{formatPct(b.pct, 0)}</span>
              <span className="ml-2 text-[0.75rem] text-muted-foreground">{formatUsd(b.usd, { compact: true })}</span>
            </span>
          </div>
          <div className="mt-1.5 h-2 w-full rounded-full bg-muted">
            <div className="h-2 rounded-full" style={{ width: `${Math.max(1.5, b.pct)}%`, background: color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function FundsBreakdown({ flows }: { flows: FundFlows }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ArrowDownLeft className="h-4 w-4" style={{ color: "var(--chart-in)" }} />
            <CardTitle>Source of Funds</CardTitle>
          </div>
          <CardDescription>Top incoming sources · {formatUsd(flows.totalIncomingUsd)} received (priced)</CardDescription>
        </CardHeader>
        <CardContent>
          <Breakdown buckets={flows.sources} color="var(--chart-in)" empty="No priced incoming value observed." />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ArrowUpRight className="h-4 w-4" style={{ color: "var(--chart-out)" }} />
            <CardTitle>Destination of Funds</CardTitle>
          </div>
          <CardDescription>Top outgoing destinations · {formatUsd(flows.totalOutgoingUsd)} sent (priced)</CardDescription>
        </CardHeader>
        <CardContent>
          <Breakdown buckets={flows.destinations} color="var(--chart-out)" empty="No priced outgoing value observed." />
        </CardContent>
      </Card>
    </div>
  );
}
