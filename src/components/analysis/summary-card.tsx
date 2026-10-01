import { FileSearch } from "lucide-react";
import type { WalletAnalysis } from "@/types/domain";
import { Card } from "@/components/ui/card";

export function SummaryCard({ analysis }: { analysis: WalletAnalysis }) {
  return (
    <Card>
      <div className="flex items-start gap-4 p-5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-secondary text-navy-800">
          <FileSearch className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <h2 className="section-title">Investigation Summary</h2>
            <span className="text-[0.6875rem] text-muted-foreground">Generated deterministically from analysis data — no AI-generated conclusions</span>
          </div>
          <p className="mt-2 text-[0.9375rem] leading-relaxed text-foreground/90">{analysis.summary.join(" ")}</p>
        </div>
      </div>
    </Card>
  );
}
