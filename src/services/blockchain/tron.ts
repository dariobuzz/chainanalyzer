import "server-only";
import { createHash } from "node:crypto";
import type { DataSource, Transfer } from "@/types/domain";
import { config } from "@/lib/config";
import { PublicError } from "@/lib/security/errors";
import { nativeAsset, toUnits } from "./normalize";
import { fetchJsonRetry, timeBudget } from "./providers/http";
import type { BlockchainProvider, FetchOptions, RawWalletData } from "./types";

interface TronAccount {
  address?: string;
  type?: string;
  balance?: number;
  create_time?: number;
  trc20?: Record<string, string>[];
}

interface TronTx {
  txID: string;
  blockNumber: number;
  block_timestamp: number;
  net_fee?: number;
  energy_fee?: number;
  ret?: { contractRet?: string; fee?: number }[];
  raw_data?: { contract?: { type: string; parameter: { value: Record<string, unknown> } }[] };
}

interface Trc20Tx {
  transaction_id: string;
  block_timestamp: number;
  from: string;
  to: string;
  type: string;
  value: string;
  token_info: { symbol?: string; address: string; decimals?: number; name?: string };
}

interface TronPage<T> {
  data?: T[];
  success?: boolean;
  error?: string;
  meta?: { fingerprint?: string };
}

const PAGE_SIZE = 200;
const SUN = 1e6;

// ── base58check (Tron addresses are 0x41-prefixed 20-byte hashes) ───────────
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const sha256 = (b: Buffer) => createHash("sha256").update(b).digest();

function base58(buf: Buffer): string {
  let n = BigInt(`0x${buf.toString("hex") || "0"}`);
  let out = "";
  while (n > 0n) {
    out = B58[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const byte of buf) {
    if (byte !== 0) break;
    out = "1" + out;
  }
  return out;
}

/** "41…" hex (as returned by TronGrid for native transactions) → "T…" base58 address. */
export function tronHexToBase58(hex: unknown): string {
  if (typeof hex !== "string") return "";
  if (!/^41[0-9a-fA-F]{40}$/.test(hex)) return hex;
  const payload = Buffer.from(hex, "hex");
  return base58(Buffer.concat([payload, sha256(sha256(payload)).subarray(0, 4)]));
}

const SELECTORS: Record<string, string> = {
  a9059cbb: "transfer",
  "23b872dd": "transferFrom",
  "095ea7b3": "approve",
};

function direction(subject: string, from: string, to: string) {
  if (from === subject && to === subject) return "self" as const;
  return from === subject ? ("out" as const) : ("in" as const);
}

/** Native TRX transfers and smart-contract calls; other contract types (staking, votes…) carry no counterparty value. */
export function normalizeTronTxs(subject: string, txs: TronTx[]): { transfers: Transfer[]; contracts: Set<string> } {
  const asset = nativeAsset("tron");
  const contracts = new Set<string>();
  const transfers: Transfer[] = [];
  for (const tx of txs) {
    const c = tx.raw_data?.contract?.[0];
    if (!c) continue;
    const v = c.parameter.value;
    const from = tronHexToBase58(v.owner_address);
    let to: string;
    let amount: number;
    let method: string | null = null;
    if (c.type === "TransferContract") {
      to = tronHexToBase58(v.to_address);
      amount = Number(v.amount ?? 0) / SUN;
    } else if (c.type === "TriggerSmartContract") {
      to = tronHexToBase58(v.contract_address);
      amount = Number(v.call_value ?? 0) / SUN;
      const sel = typeof v.data === "string" ? v.data.slice(0, 8).toLowerCase() : "";
      method = SELECTORS[sel] ?? (sel ? `0x${sel}` : null);
      contracts.add(to);
    } else {
      continue;
    }
    const d = direction(subject, from, to);
    const ret = tx.ret?.[0];
    const fee = (tx.net_fee ?? 0) + (tx.energy_fee ?? 0) || ret?.fee || 0;
    transfers.push({
      id: `${tx.txID}:n`,
      hash: tx.txID.toLowerCase(),
      timestamp: tx.block_timestamp,
      blockNumber: tx.blockNumber,
      from,
      to,
      direction: d,
      counterparty: d === "self" ? subject : d === "out" ? to : from,
      asset,
      amount,
      usdValue: null,
      kind: "native",
      method,
      isError: Boolean(ret?.contractRet && ret.contractRet !== "SUCCESS"),
      feeNative: d === "out" ? fee / SUN : null,
    });
  }
  return { transfers, contracts };
}

export function normalizeTrc20Txs(subject: string, txs: Trc20Tx[]): Transfer[] {
  return txs
    .filter((tx) => tx.type === "Transfer")
    .map((tx, i) => {
      const d = direction(subject, tx.from, tx.to);
      const decimals = Number(tx.token_info.decimals ?? 0) || 0;
      return {
        id: `${tx.transaction_id}:t:${i}:${tx.token_info.address}`,
        hash: tx.transaction_id.toLowerCase(),
        timestamp: tx.block_timestamp,
        blockNumber: 0,
        from: tx.from,
        to: tx.to,
        direction: d,
        counterparty: d === "self" ? subject : d === "out" ? tx.to : tx.from,
        asset: {
          symbol: (tx.token_info.symbol || "UNKNOWN").slice(0, 16),
          name: tx.token_info.name?.slice(0, 64),
          contract: tx.token_info.address,
          decimals,
          kind: "token" as const,
        },
        amount: toUnits(tx.value, decimals),
        usdValue: null,
        kind: "token" as const,
        method: null,
        isError: false,
        feeNative: null,
      };
    });
}

/** Tron adapter on the TronGrid v1 API (keyless works with low rate limits; TRONGRID_API_KEY recommended). */
export class TronAdapter implements BlockchainProvider {
  readonly id = "tron:tron";
  readonly chain = "tron" as const;

  constructor(
    private readonly apiUrl: string,
    private readonly apiKey: string,
  ) {}

  private get<T>(path: string, timeoutMs = 10_000) {
    const headers: Record<string, string> = { accept: "application/json" };
    if (this.apiKey) headers["TRON-PRO-API-KEY"] = this.apiKey;
    return fetchJsonRetry<T>(`${this.apiUrl}${path}`, { provider: "TronGrid", headers, timeoutMs }, 3);
  }

  /** Follows TronGrid fingerprint pagination until `limit` records, the end, or the time budget. */
  private async paged<T>(path: string, limit: number, budget: ReturnType<typeof timeBudget>): Promise<{ rows: T[]; complete: boolean }> {
    const rows: T[] = [];
    let fingerprint: string | undefined;
    for (;;) {
      const qs = new URLSearchParams({ limit: String(Math.min(PAGE_SIZE, limit - rows.length)), only_confirmed: "true" });
      if (fingerprint) qs.set("fingerprint", fingerprint);
      const page = await this.get<TronPage<T>>(`${path}?${qs}`, budget.timeout(3000));
      if (page.success === false) throw new Error(page.error ?? "TronGrid error");
      rows.push(...(page.data ?? []));
      fingerprint = page.meta?.fingerprint;
      if (!fingerprint) return { rows, complete: true };
      if (rows.length >= limit || budget.expired()) return { rows, complete: false };
    }
  }

  async fetchWalletData(address: string, opts: FetchOptions): Promise<RawWalletData> {
    const warnings: string[] = [];
    const limit = opts.maxTransactions;
    const budget = timeBudget(config.historyTimeBudgetMs);

    let account: TronAccount | null;
    let native: { rows: TronTx[]; complete: boolean };
    let trc20: { rows: Trc20Tx[]; complete: boolean };
    try {
      const [acc, n, t] = await Promise.all([
        this.get<TronPage<TronAccount>>(`/v1/accounts/${address}`),
        this.paged<TronTx>(`/v1/accounts/${address}/transactions`, limit, budget),
        this.paged<Trc20Tx>(`/v1/accounts/${address}/transactions/trc20`, limit, budget),
      ]);
      account = acc.data?.[0] ?? null;
      native = n;
      trc20 = t;
    } catch (e) {
      const reason = (e as Error).message;
      const hint = /429|401|403/.test(reason) ? " The keyless TronGrid rate limit was reached: configure TRONGRID_API_KEY, or retry in a minute." : "";
      throw new PublicError(`Tron data provider unavailable. ${reason}.${hint}`, 502, "provider_unavailable");
    }

    const { transfers: nativeTransfers, contracts } = normalizeTronTxs(address, native.rows);
    const tokenTransfers = normalizeTrc20Txs(address, trc20.rows);
    const transfers = [...nativeTransfers, ...tokenTransfers].sort((a, b) => b.timestamp - a.timestamp);
    const truncated = !native.complete || !trc20.complete;
    if (truncated && budget.expired()) warnings.push("History fetch stopped early to stay within the time budget.");

    const hashes = new Set([...native.rows.map((t) => t.txID.toLowerCase()), ...trc20.rows.map((t) => t.transaction_id.toLowerCase())]);
    let firstActivity = account?.create_time ?? null;
    if (firstActivity === null && !truncated && transfers.length) firstActivity = Math.min(...transfers.map((t) => t.timestamp));

    const tokenBalances: RawWalletData["tokenBalances"] = [];
    const held = new Map<string, string>();
    for (const entry of account?.trc20 ?? []) for (const [contract, raw] of Object.entries(entry)) held.set(contract, raw);
    for (const asset of opts.balanceTokens) {
      const raw = asset.contract ? held.get(asset.contract) : undefined;
      if (raw && raw !== "0") tokenBalances.push({ asset, balance: toUnits(raw, asset.decimals) });
    }

    const contractFlags: Record<string, boolean> = {};
    for (const c of contracts) contractFlags[c] = true;
    if (!account) warnings.push("Account not activated on Tron (no on-chain account record).");

    const now = new Date().toISOString();
    const sources: DataSource[] = [
      {
        name: "TronGrid API",
        kind: "blockchain",
        detail: `Tron account, TRX transfers, smart-contract calls and TRC-20 transfers (up to ${limit} per type).`,
        url: new URL(this.apiUrl).origin,
        asOf: now,
      },
    ];

    return {
      chain: "tron",
      address,
      nativeBalance: account ? (account.balance ?? 0) / SUN : 0,
      tokenBalances,
      transfers,
      totalTransactions: { value: hashes.size, isLowerBound: truncated },
      firstActivity,
      lastActivity: transfers.length ? transfers[0].timestamp : null,
      contractFlags,
      subjectIsContract: account ? account.type === "Contract" : null,
      truncated,
      sources,
      warnings,
    };
  }
}

export function createTronProvider() {
  return new TronAdapter(config.tron.apiUrl, config.tron.apiKey);
}
