import { Info, ShieldAlert } from "lucide-react";
import type { WalletAnalysis } from "@/types/domain";
import { RISK_CATEGORY_LABEL, RISK_LEVELS, RISK_NOTICE } from "@/lib/constants";
import { Card } from "@/components/ui/card";
import { RISK_STYLE, SeverityBadge } from "@/components/shared";
import { RiskGauge } from "./risk-gauge";

export function RiskScoreCard({ analysis }: { analysis: WalletAnalysis }) {
  const { risk } = analysis;
  const style = RISK_STYLE[risk.riskLevel];
  const total = risk.riskFactors.reduce((s, f) => s + f.scoreContribution, 0);
  return (
    <Card className="flex h-full flex-col">
      <div className="flex items-center justify-between px-5 pt-5">
        <p className="eyebrow">Risk Score</p>
        <span className="text-[0.6875rem] text-muted-foreground">Methodology {risk.methodologyVersion}</span>
      </div>
      <div className="flex flex-col items-center px-5 pt-2">
        <RiskGauge score={risk.riskScore} level={risk.riskLevel} />
        <div
          className="-mt-1 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[0.8125rem] font-semibold"
          style={{ color: style.color, background: style.bg }}
        >
          <ShieldAlert className="h-3.5 w-3.5" /> {risk.riskLevel} risk
        </div>
        <div className="mt-3 flex w-full items-center justify-center gap-1">
          {RISK_LEVELS.map((b) => (
            <span
              key={b.level}
              className="flex-1 rounded-sm py-0.5 text-center text-[0.625rem] font-medium"
              style={{
                color: b.level === risk.riskLevel ? "#fff" : "#6b7385",
                background: b.level === risk.riskLevel ? RISK_STYLE[b.level].color : "#f1f3f6",
              }}
              title={`${b.min}–${b.max}`}
            >
              {b.min}–{b.max}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-5 border-t px-5 py-4">
        <div className="flex items-center justify-between">
          <p className="text-[0.8125rem] font-semibold">Score composition</p>
          <p className="text-[0.75rem] text-muted-foreground">
            Confidence: <span className="font-semibold text-foreground">{risk.confidence.level}</span>
          </p>
        </div>
        {risk.riskFactors.filter((f) => f.scoreContribution > 0).length === 0 ? (
          <p className="mt-2 text-[0.8125rem] text-muted-foreground">No risk factor contributed points to the score.</p>
        ) : (
          <ul className="mt-2.5 space-y-2">
            {risk.riskFactors
              .filter((f) => f.scoreContribution > 0)
              .slice(0, 6)
              .map((f) => (
                <li key={f.category} className="flex items-center gap-2 text-[0.8125rem]">
                  <span className="flex-1 truncate">{RISK_CATEGORY_LABEL[f.category]}</span>
                  <SeverityBadge severity={f.severity} />
                  <span className="mono w-12 text-right font-semibold tabular">+{f.scoreContribution}</span>
                </li>
              ))}
          </ul>
        )}
        {total > 100 || analysis.subjectSanction ? (
          <p className="mt-2 text-[0.6875rem] text-muted-foreground">
            {analysis.subjectSanction ? "Direct sanctions match: score set to 100." : `Sum of contributions (${Math.round(total)}) capped at 100.`}
          </p>
        ) : null}
      </div>
      <div className="mt-auto flex gap-2 rounded-b-lg border-t bg-muted/50 px-5 py-3 text-[0.6875rem] leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {RISK_NOTICE}
      </div>
    </Card>
  );
}
