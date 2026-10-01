"use client";

import * as React from "react";
import { CheckCircle2, ChevronDown, CircleHelp, Database, Activity, ShieldAlert, MinusCircle } from "lucide-react";
import type { IndicatorStatus, RiskIndicator } from "@/types/domain";
import { NO_INTEL } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SeverityBadge } from "@/components/shared";

const STATUS: Record<IndicatorStatus, { label: string; icon: React.ElementType; cls: string }> = {
  detected: { label: "Detected", icon: ShieldAlert, cls: "text-risk-high" },
  not_detected: { label: "Not detected", icon: CheckCircle2, cls: "text-risk-low" },
  no_verified_intelligence: { label: NO_INTEL, icon: CircleHelp, cls: "text-muted-foreground" },
  insufficient_data: { label: "Insufficient data", icon: MinusCircle, cls: "text-muted-foreground" },
};

function IndicatorRow({ ind }: { ind: RiskIndicator }) {
  const [open, setOpen] = React.useState(ind.status === "detected" && ind.scoreContribution >= 10);
  const s = STATUS[ind.status];
  const expandable = ind.description || ind.evidence.length;
  return (
    <li className={cn("border-b last:border-0", ind.status === "detected" && ind.scoreContribution > 0 && "bg-risk-high-bg/40")}>
      <button
        type="button"
        onClick={() => expandable && setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left"
        aria-expanded={open}
      >
        <s.icon className={cn("h-4 w-4 shrink-0", s.cls)} />
        <span className="flex-1 text-[0.8125rem] font-medium">{ind.label}</span>
        {ind.status === "detected" ? (
          <>
            {ind.severity ? <SeverityBadge severity={ind.severity} /> : null}
            <span className="mono w-10 text-right text-[0.8125rem] font-semibold">+{ind.scoreContribution}</span>
          </>
        ) : (
          <span className={cn("max-w-[55%] truncate text-right text-[0.75rem]", s.cls)} title={s.label}>
            {s.label}
          </span>
        )}
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="space-y-2 px-4 pb-3 pl-11 text-[0.75rem]">
          <p className="leading-relaxed text-foreground/80">{ind.description}</p>
          {ind.evidence.length ? (
            <ul className="space-y-1 rounded-md border bg-card p-2.5">
              {ind.evidence.map((e, i) => (
                <li key={i} className="mono text-[0.6875rem] leading-relaxed text-foreground/80">
                  {e}
                </li>
              ))}
            </ul>
          ) : null}
          <p className="text-muted-foreground">
            <span className="font-medium">Source:</span> {ind.source}
          </p>
        </div>
      ) : null}
    </li>
  );
}

export function RiskIndicators({ indicators }: { indicators: RiskIndicator[] }) {
  const verified = indicators.filter((i) => i.group === "verified_intelligence");
  const behavioral = indicators.filter((i) => i.group === "behavioral");
  const order = (a: RiskIndicator, b: RiskIndicator) =>
    Number(b.status === "detected") - Number(a.status === "detected") || b.scoreContribution - a.scoreContribution;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="border-b pb-4">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-navy-700" />
            <CardTitle>Verified Intelligence</CardTitle>
          </div>
          <CardDescription>Matches against external datasets: sanctions lists and labelled entities. No source → no classification.</CardDescription>
        </CardHeader>
        <ul>{[...verified].sort(order).map((i) => <IndicatorRow key={i.category} ind={i} />)}</ul>
      </Card>
      <Card>
        <CardHeader className="border-b pb-4">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-navy-700" />
            <CardTitle>Behavioral Indicators</CardTitle>
          </div>
          <CardDescription>Derived exclusively from observable on-chain activity. Not an attribution of identity or intent.</CardDescription>
        </CardHeader>
        <ul>{[...behavioral].sort(order).map((i) => <IndicatorRow key={i.category} ind={i} />)}</ul>
      </Card>
    </div>
  );
}
