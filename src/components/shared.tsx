import type { DataMode, EntityType, RiskLevel, Severity } from "@/types/domain";
import { ENTITY_TYPE_LABEL } from "@/lib/constants";
import { shortAddress } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { RISK_STYLE } from "@/lib/risk-style";
import { CopyButton } from "@/components/copy-button";

export { RISK_STYLE };

export function RiskBadge({ level, score, className }: { level: RiskLevel; score?: number; className?: string }) {
  return (
    <Badge variant={RISK_STYLE[level].variant} className={className}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: RISK_STYLE[level].color }} />
      {score !== undefined ? `${score} · ` : ""}
      {level}
    </Badge>
  );
}

const SEVERITY_VARIANT: Record<Severity, "outline" | "lowmod" | "moderate" | "high" | "veryhigh"> = {
  info: "outline",
  low: "lowmod",
  medium: "moderate",
  high: "high",
  critical: "veryhigh",
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  return <Badge variant={SEVERITY_VARIANT[severity]} className="capitalize">{severity}</Badge>;
}

const RISKY_TYPES: EntityType[] = ["mixer", "darknet", "scam", "ransomware", "stolen_funds", "sanctioned", "high_risk_exchange", "unlicensed_service", "gambling"];

export function EntityTypeBadge({ type }: { type: EntityType | "other" | "subject" }) {
  if (type === "other") return <Badge variant="outline">Other</Badge>;
  if (type === "subject") return <Badge variant="navy">Analyzed wallet</Badge>;
  const risky = RISKY_TYPES.includes(type);
  const variant = type === "sanctioned" ? "veryhigh" : risky ? "high" : type === "unknown_wallet" || type === "smart_contract" ? "outline" : "default";
  return <Badge variant={variant}>{ENTITY_TYPE_LABEL[type]}</Badge>;
}

export function DataModeBadge({ mode }: { mode: DataMode }) {
  return mode === "demo" ? (
    <Badge variant="demo">Demo Data</Badge>
  ) : (
    <Badge variant="live">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
      Live blockchain data
    </Badge>
  );
}

export function Address({ value, full = false, copy = true, className }: { value: string; full?: boolean; copy?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 mono", className)} title={value}>
      {full ? value : shortAddress(value)}
      {copy ? <CopyButton value={value} /> : null}
    </span>
  );
}

export function StatusDot({ tone }: { tone: "green" | "amber" | "red" | "gray" }) {
  const c = { green: "bg-emerald-500", amber: "bg-amber-500", red: "bg-red-500", gray: "bg-slate-300" }[tone];
  return <span className={cn("inline-block h-2 w-2 rounded-full", c)} />;
}
