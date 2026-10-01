import { AlertTriangle, Database } from "lucide-react";
import type { WalletAnalysis } from "@/types/domain";
import { formatDateTime } from "@/lib/format";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const KIND_LABEL = { blockchain: "Blockchain", sanctions: "Sanctions", entity_labels: "Entity labels", pricing: "Pricing", demo: "Demo" } as const;

export function DataSourcesCard({ analysis }: { analysis: WalletAnalysis }) {
  return (
    <Card>
      <CardHeader className="border-b pb-4">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-navy-700" />
          <CardTitle>Data Sources & Limitations</CardTitle>
        </div>
        <CardDescription>Every figure on this page is derived from the sources below.</CardDescription>
      </CardHeader>
      <ul className="divide-y">
        {analysis.risk.dataSources.map((s, i) => (
          <li key={i} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-start sm:gap-4">
            <Badge variant={s.kind === "demo" ? "demo" : "outline"} className="w-fit shrink-0">
              {KIND_LABEL[s.kind]}
            </Badge>
            <div className="min-w-0 flex-1 text-[0.8125rem]">
              <p className="font-medium">
                {s.url ? (
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                    {s.name}
                  </a>
                ) : (
                  s.name
                )}
              </p>
              <p className="text-muted-foreground">{s.detail}</p>
            </div>
            {s.asOf && s.asOf !== "demo" ? (
              <span className="shrink-0 text-[0.6875rem] text-muted-foreground">{/^\d{4}-\d{2}-\d{2}$/.test(s.asOf) ? s.asOf : formatDateTime(s.asOf)}</span>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="space-y-1.5 border-t bg-muted/40 px-5 py-3 text-[0.75rem] text-muted-foreground">
        <p>{analysis.pricing.note}</p>
        {analysis.risk.confidence.reasons.map((r, i) => (
          <p key={i} className="flex gap-1.5">
            <span>•</span>
            {r}
          </p>
        ))}
        {analysis.warnings.map((w, i) => (
          <p key={`w${i}`} className="flex gap-1.5 text-amber-800">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            {w}
          </p>
        ))}
      </div>
    </Card>
  );
}
