import type { EntityType, RiskCategory, RiskLevel } from "@/types/domain";

export const DISCLAIMER =
  "ChainScope provides blockchain intelligence and decision-support information. Risk indicators do not constitute legal advice, AML certification, or a determination that an individual or entity has engaged in unlawful activity.";

export const RISK_NOTICE =
  "Risk indicators are decision-support information and do not replace professional AML assessment.";

export const NO_INTEL = "Unknown / No verified intelligence available";

export const METHODOLOGY_VERSION = "CS-RISK-0.1";

export const ENTITY_TYPE_LABEL: Record<EntityType, string> = {
  cex: "Centralized Exchange",
  dex: "DEX",
  bridge: "Bridge",
  mixer: "Mixer",
  token_contract: "Token Contract",
  smart_contract: "Smart Contract",
  known_entity: "Known Entity",
  gambling: "Gambling",
  darknet: "Darknet Market",
  scam: "Known Scam",
  ransomware: "Ransomware",
  stolen_funds: "Stolen Funds",
  high_risk_exchange: "High-Risk Exchange",
  unlicensed_service: "Unlicensed Service",
  sanctioned: "Sanctioned Entity",
  unknown_wallet: "Unknown Wallet",
};

/** Entity types that represent verified risk intelligence, mapped to their risk category. */
export const RISK_ENTITY_CATEGORY: Partial<Record<EntityType, RiskCategory>> = {
  mixer: "mixer_exposure",
  darknet: "darknet_exposure",
  scam: "known_scam",
  ransomware: "ransomware",
  stolen_funds: "stolen_funds",
  gambling: "gambling",
  high_risk_exchange: "high_risk_exchange",
  unlicensed_service: "unlicensed_service",
  sanctioned: "sanctioned_address",
};

export const RISK_CATEGORY_LABEL: Record<RiskCategory, string> = {
  sanctioned_address: "Sanctioned Address",
  known_scam: "Known Scam",
  stolen_funds: "Stolen Funds",
  mixer_exposure: "Mixer Exposure",
  darknet_exposure: "Darknet Exposure",
  ransomware: "Ransomware",
  high_risk_exchange: "High-Risk Exchange",
  unlicensed_service: "Unlicensed Service",
  gambling: "Gambling",
  bridge_exposure: "Bridge Exposure",
  dex_exposure: "DEX Exposure",
  high_velocity: "High Velocity Transactions",
  recently_created: "Recently Created Wallet",
  unusual_pattern: "Unusual Transaction Pattern",
};

export const RISK_LEVELS: { level: RiskLevel; min: number; max: number }[] = [
  { level: "Low", min: 0, max: 20 },
  { level: "Low/Moderate", min: 21, max: 40 },
  { level: "Moderate", min: 41, max: 60 },
  { level: "High", min: 61, max: 80 },
  { level: "Very High", min: 81, max: 100 },
];

export function riskLevelFor(score: number): RiskLevel {
  const s = Math.round(score);
  return (RISK_LEVELS.find((r) => s >= r.min && s <= r.max) ?? RISK_LEVELS[0]).level;
}
