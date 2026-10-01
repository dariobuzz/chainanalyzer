import type { BehaviorAnalysis } from "@/types/domain";
import { cn } from "@/lib/utils";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function BehaviorPanel({ behavior }: { behavior: BehaviorAnalysis }) {
  return (
    <Card>
      <CardHeader className="border-b pb-4">
        <CardTitle>Behavioral Analysis</CardTitle>
        <CardDescription>Metrics computed exclusively from observable on-chain data, separate from external AML intelligence.</CardDescription>
      </CardHeader>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4">
        {behavior.metrics.map((m) => (
          <div key={m.key} className="border-b border-r px-5 py-4 [&:nth-child(4n)]:lg:border-r-0">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  m.flag === "elevated" ? "bg-risk-high" : m.flag === "notice" ? "bg-amber-500" : "bg-slate-300",
                )}
                aria-hidden
              />
              <p className="eyebrow">{m.label}</p>
            </div>
            <p className="mt-1.5 text-[1.0625rem] font-semibold tracking-tight tabular">{m.value}</p>
            <p className="mt-0.5 text-[0.6875rem] leading-snug text-muted-foreground">{m.detail}</p>
            {m.flag !== "neutral" ? (
              <p className={cn("mt-1 text-[0.625rem] font-semibold uppercase tracking-wide", m.flag === "elevated" ? "text-risk-high" : "text-amber-700")}>
                {m.flag === "elevated" ? "Elevated" : "Notice"}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </Card>
  );
}
