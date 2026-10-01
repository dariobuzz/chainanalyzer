import "server-only";
import type { ChainKey, EntityLabel, EntityType } from "@/types/domain";
import { config } from "@/lib/config";
import { addressKey } from "@/lib/addresses";
import { ProviderError } from "@/services/blockchain/providers/http";

/**
 * MetaSleuth (BlockSec AML API): address labels and address risk scores.
 * https://docs.metasleuth.io/blocksec-aml-api/introduction
 *
 * Both APIs are optional (separate keys) and only used for live data. Analyzed
 * addresses are sent to BlockSec, which is disclosed in the report's data sources.
 */

const LABEL_API = "https://aml.blocksec.com/address-label/api/v3";
const RISK_API = "https://aml.blocksec.com/address-compliance/api/v3";
const PROVIDER = "MetaSleuth (BlockSec)";
export const METASLEUTH_LABEL_SOURCE = "MetaSleuth (BlockSec) Address Label API";
export const METASLEUTH_RISK_SOURCE = "MetaSleuth (BlockSec) Risk Score API";
const BATCH_LIMIT = 100;
const LABEL_TTL_MS = 24 * 3_600_000;
const RISK_TTL_MS = 3_600_000;
const SUCCESS = 200000;

const CHAIN_ID: Record<ChainKey, number> = { ethereum: 1, base: 8453, bsc: 56, bitcoin: -1, tron: -2, solana: -3 };

interface Named {
  name: string;
  code: number;
}

interface EntityInfo {
  entity?: string;
  categories?: Named[] | null;
  attributes?: Named[] | null;
}

interface LabelData {
  address: string;
  main_entity?: string;
  main_entity_info?: EntityInfo | null;
  comp_entities?: EntityInfo[] | null;
  attributes?: Named[] | null;
  name_tag?: string;
}

interface Envelope<T> {
  code: number;
  message: string;
  data?: T;
}

export interface ThirdPartyRisk {
  provider: string;
  /** 1 (no risk) … 5 (critical). */
  score: number;
  indicators: { type: string; name: string; code: number }[];
}

// ── Mapping onto ChainScope entity types ────────────────────────────────────
// Risk-bearing labels win over service labels; within each group the order is by severity.
const RISK_LABELS: [string, EntityType][] = [
  ["SANCTIONED", "sanctioned"],
  ["TERRORIST", "illicit_activity"],
  ["CHILD ABUSE MATERIAL", "illicit_activity"],
  ["LAUNDERING", "illicit_activity"],
  ["BLOCKED", "illicit_activity"],
  ["RANSOMWARE", "ransomware"],
  ["ATTACKER", "stolen_funds"],
  ["EXPLOIT", "stolen_funds"],
  ["DARK MARKET", "darknet"],
  ["DARKWEB BUSINESS", "darknet"],
  ["MIXER", "mixer"],
  ["MIXING", "mixer"],
  ["SCAM", "scam"],
  ["NO KYC", "high_risk_exchange"],
  ["GAMBLING", "gambling"],
];
const SERVICE_LABELS: [string, EntityType][] = [
  ["EXCHANGE", "cex"],
  ["OTC DESK", "cex"],
  ["DEX", "dex"],
  ["DEX AGGREGATOR", "dex"],
  ["BRIDGE", "bridge"],
];

function classify(names: Set<string>): EntityType {
  for (const [name, type] of [...RISK_LABELS, ...SERVICE_LABELS]) if (names.has(name)) return type;
  return "known_entity";
}

/** Converts a MetaSleuth label into an EntityLabel, or null when the address is unlabelled. */
export function toEntityLabel(chain: ChainKey, d: LabelData): EntityLabel | null {
  const infos = [d.main_entity_info, ...(d.comp_entities ?? [])].filter((i): i is EntityInfo => Boolean(i));
  const named = [...infos.flatMap((i) => [...(i.categories ?? []), ...(i.attributes ?? [])]), ...(d.attributes ?? [])];
  const names = new Set(named.map((n) => n.name.toUpperCase()));
  const entity = d.main_entity || infos.find((i) => i.entity)?.entity || "";
  if (!entity && !d.name_tag && names.size === 0) return null;
  return {
    address: addressKey(d.address),
    chain,
    entityName: (d.name_tag || entity || [...names][0]).slice(0, 120),
    entityType: classify(names),
    source: METASLEUTH_LABEL_SOURCE,
    confidence: 0.9,
    lastUpdated: new Date().toISOString().slice(0, 10),
    reference: names.size ? [...names].join(", ") : undefined,
  };
}

// ── HTTP + daily quota ──────────────────────────────────────────────────────
// Each API key has a daily address quota, reported in x-ratelimit-* headers. Tracking it
// lets a batch be trimmed to what is left instead of being rejected as a whole.
type Api = "labels" | "risk";
const quota: Record<Api, { remaining: number; resetAt: number } | null> = { labels: null, risk: null };

/** Addresses still available today for this API, or null when unknown. */
function remaining(api: Api): number | null {
  const q = quota[api];
  if (!q || Date.now() >= q.resetAt) return null;
  return q.remaining;
}

function quotaError(api: Api): ProviderError {
  const reset = quota[api] ? new Date(quota[api]!.resetAt).toISOString().slice(0, 16).replace("T", " ") : "the next reset";
  return new ProviderError(`${PROVIDER}: daily ${api === "labels" ? "label" : "risk score"} quota exhausted (resets ${reset} UTC)`, PROVIDER);
}

async function post<T>(api: Api, url: string, key: string, body: unknown): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "API-KEY": key, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
      cache: "no-store",
    });
  } catch (e) {
    throw new ProviderError(`${PROVIDER} request ${(e as Error).name === "AbortError" ? "timed out" : "network error"}`, PROVIDER);
  } finally {
    clearTimeout(timer);
  }
  const left = Number(res.headers.get("x-ratelimit-remaining"));
  const reset = Number(res.headers.get("x-ratelimit-reset"));
  if (Number.isFinite(left) && Number.isFinite(reset) && reset > 0) quota[api] = { remaining: left, resetAt: reset * 1000 };
  if (res.status === 429) throw quotaError(api);
  const json = (await res.json().catch(() => null)) as Envelope<T> | null;
  if (!res.ok || !json || json.code !== SUCCESS || json.data === undefined) {
    throw new ProviderError(`${PROVIDER}: ${json?.message || `HTTP ${res.status}`}`, PROVIDER);
  }
  return json.data;
}

// Per-instance caches: labels change slowly and every address consumes daily quota.
const labelCache = new Map<string, { at: number; label: EntityLabel | null }>();
const riskCache = new Map<string, { at: number; risk: ThirdPartyRisk }>();

export const metasleuthLabelsEnabled = () => Boolean(config.metasleuth.labelApiKey) && config.metasleuth.maxLabels > 0;
export const metasleuthRiskEnabled = () => Boolean(config.metasleuth.riskApiKey);

/** Labels for up to `maxLabels` addresses (already ordered by relevance), in batches of 100. */
export async function fetchMetaSleuthLabels(chain: ChainKey, addresses: string[]): Promise<{ labels: EntityLabel[]; checked: number; quotaLimited: boolean }> {
  const key = config.metasleuth.labelApiKey;
  const chainId = CHAIN_ID[chain];
  const wanted = [...new Set(addresses.map(addressKey))].slice(0, config.metasleuth.maxLabels);
  const now = Date.now();
  const labels: EntityLabel[] = [];
  const missing: string[] = [];
  for (const a of wanted) {
    const hit = labelCache.get(`${chainId}:${a}`);
    if (hit && now - hit.at < LABEL_TTL_MS) {
      if (hit.label) labels.push(hit.label);
    } else {
      missing.push(a);
    }
  }
  // Addresses are ordered by relevance, so trimming to the remaining quota keeps the most useful ones.
  const left = remaining("labels");
  // Fail only when nothing at all is available; cached labels stay usable when the quota is spent.
  if (left === 0 && missing.length === wanted.length) throw quotaError("labels");
  const toFetch = left === null ? missing : missing.slice(0, left);
  let fetched = 0;
  for (let i = 0; i < toFetch.length; i += BATCH_LIMIT) {
    let chunk = toFetch.slice(i, i + BATCH_LIMIT);
    let data: LabelData[];
    try {
      data = await post<LabelData[]>("labels", `${LABEL_API}/batch-labels`, key, { chain_id: chainId, addresses: chunk });
    } catch (e) {
      // Rejected because the batch exceeds what is left today: retry once with the most relevant addresses.
      const left = remaining("labels");
      if (!left || left >= chunk.length) {
        if (fetched || labels.length) break; // keep what was obtained so far
        throw e;
      }
      chunk = chunk.slice(0, left);
      data = await post<LabelData[]>("labels", `${LABEL_API}/batch-labels`, key, { chain_id: chainId, addresses: chunk });
    }
    const byAddress = new Map(data.map((d) => [addressKey(d.address), d]));
    for (const a of chunk) {
      const d = byAddress.get(a);
      const label = d ? toEntityLabel(chain, d) : null;
      labelCache.set(`${chainId}:${a}`, { at: now, label });
      if (label) labels.push(label);
    }
    fetched += chunk.length;
  }
  if (labelCache.size > 20_000) labelCache.clear();
  const checked = wanted.length - missing.length + fetched;
  return { labels, checked, quotaLimited: checked < wanted.length };
}

/** Risk score of a single address, including interaction risk (supported on all ChainScope chains). */
export async function fetchMetaSleuthRisk(chain: ChainKey, address: string): Promise<ThirdPartyRisk> {
  const cacheKey = `${CHAIN_ID[chain]}:${address}`;
  const hit = riskCache.get(cacheKey);
  if (hit && Date.now() - hit.at < RISK_TTL_MS) return hit.risk;
  if (remaining("risk") === 0) throw quotaError("risk");
  const data = await post<{ risk_score: number; risk_indicators?: { type: string; indicator: Named }[] | null }>("risk", `${RISK_API}/risk-score`, config.metasleuth.riskApiKey, {
    chain_id: CHAIN_ID[chain],
    address,
    interaction_risk: true,
  });
  const risk: ThirdPartyRisk = {
    provider: METASLEUTH_RISK_SOURCE,
    score: Number(data.risk_score) || 0,
    indicators: (data.risk_indicators ?? []).map((r) => ({ type: r.type, name: r.indicator.name, code: r.indicator.code })),
  };
  riskCache.set(cacheKey, { at: Date.now(), risk });
  if (riskCache.size > 5000) riskCache.clear();
  return risk;
}
