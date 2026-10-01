import "server-only";
import { createHash } from "node:crypto";
import type { ChainKey, DataMode, DataSource, Transfer, WalletAnalysis, WalletOverview } from "@/types/domain";
import { config } from "@/lib/config";
import { getStore } from "@/lib/db";
import { CHAINS } from "@/services/blockchain/chains";
import { getLiveProvider } from "@/services/blockchain";
import type { RawWalletData } from "@/services/blockchain/types";
import { DemoProvider } from "@/services/demo/demo-provider";
import { createEntityRegistry } from "@/services/intelligence/entities";
import { SanctionsScreener } from "@/services/intelligence/sanctions";
import { assessRisk } from "@/services/intelligence/risk";
import { DEMO_PRICES, assetPrice, getLivePriceBook, nativePrice, pricedTokenAssets, pricingDataSource, type PriceBook } from "@/services/pricing/prices";
import { analyzeBehavior } from "./behavior";
import { buildCounterparties, valueTransfers } from "./counterparties";
import { buildFlows, buildMonthly } from "./flows";
import { buildFundFlowGraph } from "./graph";
import { buildSummary } from "./summary";

const MAX_TRANSFERS_IN_PAYLOAD = 1500;
const MAX_COUNTERPARTIES_IN_PAYLOAD = 500;

export function currentDataMode(): DataMode {
  return config.demoMode ? "demo" : "live";
}

// ── Cache ───────────────────────────────────────────────────────────────────
const g = globalThis as unknown as {
  __csMem?: Map<string, WalletAnalysis>;
  __csInflight?: Map<string, Promise<WalletAnalysis>>;
};
const mem = (g.__csMem ??= new Map());
const inflight = (g.__csInflight ??= new Map());

function fresh(a: WalletAnalysis) {
  return Date.now() - new Date(a.generatedAt).getTime() < config.cacheTtlMinutes * 60_000;
}

/**
 * Returns a cached analysis if still fresh, otherwise runs a new one.
 * Concurrent requests for the same wallet share a single in-flight analysis.
 */
export async function getWalletAnalysis(chain: ChainKey, address: string, opts: { refresh?: boolean } = {}): Promise<WalletAnalysis> {
  const mode = currentDataMode();
  const key = `${mode}:${chain}:${address}`;
  if (!opts.refresh) {
    const m = mem.get(key);
    if (m && fresh(m)) return m;
    const stored = await getStore()
      .getCachedAnalysis(chain, address, mode)
      .catch(() => null);
    if (stored && fresh(stored)) {
      mem.set(key, stored);
      return stored;
    }
  }
  const pending = inflight.get(key);
  if (pending) return pending;

  const p = runAnalysis(chain, address, mode)
    .then(async (a) => {
      mem.set(key, a);
      if (mem.size > 200) mem.delete(mem.keys().next().value!);
      const store = getStore();
      await store.saveAnalysis(a).catch((e) => console.error("[chainscope] cache save failed", e));
      await store
        .logActivity({ type: "analysis", message: `Analyzed ${CHAINS[chain].name} wallet: risk ${a.risk.riskScore} (${a.risk.riskLevel})`, chain, address })
        .catch(() => undefined);
      return a;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

// ── Pipeline ────────────────────────────────────────────────────────────────
async function runAnalysis(chain: ChainKey, address: string, mode: DataMode): Promise<WalletAnalysis> {
  const demo = mode === "demo";
  const provider = demo ? new DemoProvider(chain) : getLiveProvider(chain);
  const warnings: string[] = [];

  // 1. Data acquisition (provider abstraction) and prices, in parallel.
  const [raw, priceRes] = await Promise.all([
    provider.fetchWalletData(address, { maxTransactions: config.maxTransactions, balanceTokens: pricedTokenAssets(chain) }),
    demo ? Promise.resolve({ book: DEMO_PRICES, warning: undefined }) : getLivePriceBook(),
  ]);
  const book: PriceBook = priceRes.book;
  if (priceRes.warning) warnings.push(priceRes.warning);
  warnings.push(...raw.warnings);

  // 2. Pricing (by verified contract only).
  const transfers: Transfer[] = raw.transfers.map((t) => {
    const p = assetPrice(book, chain, t.asset);
    return { ...t, usdValue: p === null ? null : t.amount * p };
  });

  // 3. Intelligence: entity registry + sanctions.
  const store = getStore();
  const custom = await store.listCustomEntities().catch(() => []);
  const registry = createEntityRegistry({ demo, custom });
  const sanctions = new SanctionsScreener(demo);
  const sanctionsStatus = sanctions.status;

  const counterparties = buildCounterparties({ chain, subject: address, transfers, contractFlags: raw.contractFlags, registry, sanctions });
  const flows = buildFlows(counterparties);
  const monthly = buildMonthly(transfers);
  const now = Date.now();
  const behavior = analyzeBehavior({ transfers, counterparties, firstActivity: raw.firstActivity, now });
  const subjectSanction = sanctions.check(address);
  const subjectLabel = registry.lookup(chain, address);

  const overview = buildOverview(chain, raw, transfers, counterparties.length, book);

  const vt = valueTransfers(transfers).filter((t) => t.amount > 0);
  const unpricedShare = vt.length ? vt.filter((t) => t.usdValue === null).length / vt.length : 0;
  const totalVol = counterparties.reduce((s, c) => s + c.incomingUsd + c.outgoingUsd, 0);
  const unidentifiedVol = counterparties.filter((c) => !c.label && !c.sanction).reduce((s, c) => s + c.incomingUsd + c.outgoingUsd, 0);

  const dataSources: DataSource[] = [
    ...raw.sources,
    ...sanctions.dataSources(),
    {
      name: "ChainScope Entity Registry",
      kind: "entity_labels",
      detail: `${registry.size} labelled addresses (exchanges, DEXs, bridges, mixers, token contracts) from public explorer tags and protocol documentation${demo ? ", plus fictitious demo labels" : ""}.`,
      asOf: registry.version,
    },
    pricingDataSource(book),
  ];

  const risk = assessRisk({
    chain,
    subject: address,
    counterparties,
    behavior,
    subjectSanction,
    subjectLabel,
    sanctionsAvailable: sanctions.available,
    sanctionsAsOf: sanctionsStatus.loaded ? sanctionsStatus.fetchedAt : null,
    sanctionsAddressCount: sanctionsStatus.loaded ? sanctionsStatus.evmAddresses : 0,
    registryCoverage: registry.coverage(chain),
    analyzedTransactions: overview.transactionsAnalyzed,
    truncated: raw.truncated,
    unpricedShare,
    unidentifiedVolumeShare: totalVol > 0 ? unidentifiedVol / totalVol : 0,
    dataSources,
    demo,
  });

  const summary = buildSummary({
    overview,
    flows,
    counterparties,
    behavior,
    risk,
    subjectSanction,
    sanctionsAvailable: sanctions.available,
    sanctionsAsOf: sanctionsStatus.loaded ? sanctionsStatus.fetchedAt : null,
    demo,
  });

  if (raw.truncated) warnings.push(`Transaction history truncated to the most recent ${config.maxTransactions} records per transfer type.`);
  const generatedAt = new Date(now).toISOString();
  const demoProfile = (raw as RawWalletData & { profile?: string }).profile;

  return {
    id: createHash("sha256").update(`${mode}:${chain}:${address}:${generatedAt}`).digest("hex").slice(0, 16),
    chain,
    address,
    generatedAt,
    dataMode: mode,
    demoProfile,
    overview,
    transfers: transfers.slice(0, MAX_TRANSFERS_IN_PAYLOAD),
    counterparties: counterparties.slice(0, MAX_COUNTERPARTIES_IN_PAYLOAD),
    flows,
    monthly,
    graph: buildFundFlowGraph(address, counterparties),
    behavior,
    risk,
    subjectSanction,
    subjectLabel,
    summary,
    warnings,
    pricing: {
      nativeUsd: nativePrice(book, chain),
      source: book.source,
      asOf: book.asOf,
      note: demo
        ? "Demo prices (fixed, illustrative)."
        : "USD values use current spot prices applied to all transfers (not historical prices). Tokens without a verified price are excluded from USD totals.",
    },
  };
}

function buildOverview(chain: ChainKey, raw: RawWalletData, transfers: Transfer[], uniqueCounterparties: number, book: PriceBook): WalletOverview {
  const np = nativePrice(book, chain);
  const vt = valueTransfers(transfers);
  const holdings = raw.tokenBalances
    .map((h) => {
      const p = assetPrice(book, chain, h.asset);
      return { asset: h.asset, balance: h.balance, usdValue: p === null ? null : p * h.balance };
    })
    .sort((a, b) => (b.usdValue ?? 0) - (a.usdValue ?? 0));
  const nativeBalanceUsd = raw.nativeBalance !== null && np !== null ? raw.nativeBalance * np : null;
  const portfolioUsd =
    nativeBalanceUsd === null && holdings.every((h) => h.usdValue === null)
      ? null
      : (nativeBalanceUsd ?? 0) + holdings.reduce((s, h) => s + (h.usdValue ?? 0), 0);

  const assetMap = new Map<string, { symbol: string; contract: string | null; transfers: number; usdVolume: number | null }>();
  for (const t of vt) {
    if (t.amount <= 0) continue;
    const k = t.asset.contract ?? "native";
    const e = assetMap.get(k) ?? { symbol: t.asset.symbol, contract: t.asset.contract, transfers: 0, usdVolume: null };
    e.transfers += 1;
    if (t.usdValue !== null) e.usdVolume = (e.usdVolume ?? 0) + t.usdValue;
    assetMap.set(k, e);
  }

  return {
    nativeSymbol: CHAINS[chain].nativeSymbol,
    nativeBalance: raw.nativeBalance,
    nativeBalanceUsd,
    portfolioUsd,
    portfolioNote: "Native balance plus verified, priced tokens only.",
    holdings,
    topAssetsMoved: [...assetMap.values()].sort((a, b) => (b.usdVolume ?? -1) - (a.usdVolume ?? -1) || b.transfers - a.transfers).slice(0, 8),
    firstActivity: raw.firstActivity,
    lastActivity: raw.lastActivity,
    totalTransactions: raw.totalTransactions,
    transactionsAnalyzed: new Set(transfers.map((t) => t.hash)).size,
    totalIncomingUsd: vt.filter((t) => t.direction === "in").reduce((s, t) => s + (t.usdValue ?? 0), 0),
    totalOutgoingUsd: vt.filter((t) => t.direction === "out").reduce((s, t) => s + (t.usdValue ?? 0), 0),
    unpricedTransfers: vt.filter((t) => t.amount > 0 && t.usdValue === null).length,
    uniqueCounterparties,
    isContract: raw.subjectIsContract,
  };
}
