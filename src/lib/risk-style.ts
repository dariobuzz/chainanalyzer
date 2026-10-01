import type { RiskLevel } from "@/types/domain";

export const RISK_STYLE: Record<RiskLevel, { variant: "low" | "lowmod" | "moderate" | "high" | "veryhigh"; color: string; bg: string }> = {
  Low: { variant: "low", color: "#15803d", bg: "#ecfdf3" },
  "Low/Moderate": { variant: "lowmod", color: "#4d7c0f", bg: "#f4fbe6" },
  Moderate: { variant: "moderate", color: "#b45309", bg: "#fffbeb" },
  High: { variant: "high", color: "#c2410c", bg: "#fff4ed" },
  "Very High": { variant: "veryhigh", color: "#b91c1c", bg: "#fef2f2" },
};
