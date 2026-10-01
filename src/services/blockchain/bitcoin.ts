import "server-only";
import type { DataSource, Transfer } from "@/types/domain";
import { config } from "@/lib/config";
import { PublicError } from "@/lib/security/errors";
import { nativeAsset } from "./normalize";
import { fetchJsonRetry, timeBudget } from "./providers/http";
import type { BlockchainProvider, FetchOptions, RawWalletData } from "./types";

interface EsploraStats {
  funded_txo_sum: number;
  spent_txo_sum: number;
  tx_count: number;
}

interface EsploraAddress {
  chain_stats: EsploraStats;
  mempool_stats: EsploraStats;
}

interface EsploraTx {
  txid: string;
  fee: number;
  status: { confirmed: boolean; block_height?: number; block_time?: number };
  vin: { is_coinbase: boolean; prevout: { scriptpubkey_address?: string; value: number } | null }[];
  vout: { scriptpubkey_address?: string; value: number }[];
}

/** Esplora returns confirmed history in pages of 25, newest first. */
const PAGE_SIZE = 25;
const SATS = 1e8;
const COINBASE = "coinbase";

/**
 * Maps a UTXO transaction to account-style transfers from the subject's perspective.
 * Inputs may belong to several owners (multi-address wallets, services, CoinJoin), so
 * value is attributed pro rata instead of assuming the subject funded everything:
 *  - net outflow = own inputs − change back to the subject − own share of the fee,
 *    spread over the external outputs in proportion to their value;
 *  - net inflow  = value received − own inputs, attributed to the other input
 *    addresses in proportion to the value each contributed.
 */
export function utxoTransfers(subject: string, tx: EsploraTx): Transfer[] {
  const asset = nativeAsset("bitcoin");
  const base = {
    hash: tx.txid,
    timestamp: (tx.status.block_time ?? 0) * 1000,
    blockNumber: tx.status.block_height ?? 0,
    asset,
    usdValue: null,
    kind: "native" as const,
    method: null,
    isError: false,
  };
  const spent = tx.vin.reduce((s, i) => s + (i.prevout?.scriptpubkey_address === subject ? i.prevout.value : 0), 0);
  const received = tx.vout.reduce((s, o) => s + (o.scriptpubkey_address === subject ? o.value : 0), 0);
  const totalIn = tx.vin.reduce((s, i) => s + (i.prevout?.value ?? 0), 0);

  const outs = new Map<string, number>();
  for (const o of tx.vout) {
    if (o.scriptpubkey_address && o.scriptpubkey_address !== subject) outs.set(o.scriptpubkey_address, (outs.get(o.scriptpubkey_address) ?? 0) + o.value);
  }
  const external = [...outs.values()].reduce((s, v) => s + v, 0);
  const feeShare = spent > 0 && totalIn > 0 ? (tx.fee * spent) / totalIn : 0;
  const netOut = spent - received - feeShare;

  if (spent > 0 && netOut > 0 && external > 0) {
    return [...outs].map(([to, value], i) => ({
      ...base,
      id: `${tx.txid}:o:${to}`,
      from: subject,
      to,
      direction: "out",
      counterparty: to,
      amount: (netOut * value) / external / SATS,
      feeNative: i === 0 ? feeShare / SATS : null,
    }));
  }

  const netIn = received - spent;
  if (netIn <= 0) {
    if (spent === 0) return [];
    // Consolidation or self-transfer: nothing left the subject's address.
    return [{ ...base, id: `${tx.txid}:self`, from: subject, to: subject, direction: "self", counterparty: subject, amount: received / SATS, feeNative: feeShare / SATS }];
  }
  const ins = new Map<string, number>();
  for (const i of tx.vin) {
    const from = i.is_coinbase ? COINBASE : i.prevout?.scriptpubkey_address;
    if (!from || from === subject) continue;
    ins.set(from, (ins.get(from) ?? 0) + (i.prevout?.value ?? 1));
  }
  const othersIn = [...ins.values()].reduce((s, v) => s + v, 0);
  return [...ins].map(([from, value]) => ({
    ...base,
    id: `${tx.txid}:i:${from}`,
    from,
    to: subject,
    direction: "in",
    counterparty: from,
    amount: (netIn * value) / othersIn / SATS,
    feeNative: null,
  }));
}

/** Bitcoin adapter on Esplora-compatible APIs (mempool.space, Blockstream). */
export class BitcoinAdapter implements BlockchainProvider {
  readonly id = "utxo:bitcoin";
  readonly chain = "bitcoin" as const;

  constructor(private readonly apis: string[]) {
    if (apis.length === 0) throw new PublicError("No Bitcoin API configured (BITCOIN_ESPLORA_URL).", 503, "provider_not_configured");
  }

  private get<T>(api: string, path: string, timeoutMs = 8000) {
    return fetchJsonRetry<T>(`${api}${path}`, { provider: new URL(api).host, headers: { accept: "application/json" }, timeoutMs }, 2);
  }

  async fetchWalletData(address: string, opts: FetchOptions): Promise<RawWalletData> {
    const warnings: string[] = [];
    const limit = Math.min(opts.maxTransactions, config.maxTransactionsBitcoin);
    const budget = timeBudget(config.historyTimeBudgetMs);

    let api: string | null = null;
    let info: EsploraAddress | null = null;
    for (const candidate of this.apis) {
      try {
        info = await this.get<EsploraAddress>(candidate, `/address/${address}`);
        api = candidate;
        break;
      } catch (e) {
        warnings.push(`${new URL(candidate).host} unavailable: ${(e as Error).message}`);
      }
    }
    if (!api || !info) throw new PublicError("Bitcoin data provider unavailable. Retry in a minute.", 502, "provider_unavailable");

    const txs: EsploraTx[] = [];
    let last: string | null = null;
    while (txs.length < limit) {
      let page: EsploraTx[];
      try {
        page = await this.get<EsploraTx[]>(api, `/address/${address}/txs/chain${last ? `/${last}` : ""}`, budget.timeout());
      } catch (e) {
        if (txs.length === 0) throw new PublicError(`Bitcoin data provider unavailable. ${(e as Error).message}.`, 502, "provider_unavailable");
        warnings.push(`History paging stopped early: ${(e as Error).message}.`);
        break;
      }
      txs.push(...page);
      if (page.length < PAGE_SIZE) break;
      last = page[page.length - 1].txid;
      if (budget.expired()) {
        warnings.push(`History fetch stopped after ${txs.length} transactions to stay within the time budget.`);
        break;
      }
    }

    const confirmedCount = info.chain_stats.tx_count;
    const truncated = txs.length < confirmedCount;
    const transfers = txs.flatMap((tx) => utxoTransfers(address, tx)).sort((a, b) => b.timestamp - a.timestamp);
    let firstActivity: number | null = null;
    if (!truncated && txs.length) firstActivity = Math.min(...txs.map((t) => (t.status.block_time ?? Infinity) * 1000));
    else if (truncated) warnings.push("First activity date unknown: only the most recent part of the history was analyzed.");

    const balanceSats =
      info.chain_stats.funded_txo_sum - info.chain_stats.spent_txo_sum + info.mempool_stats.funded_txo_sum - info.mempool_stats.spent_txo_sum;
    const now = new Date().toISOString();
    const sources: DataSource[] = [
      {
        name: `${new URL(api).host} (Esplora API)`,
        kind: "blockchain",
        detail: `Confirmed Bitcoin transaction history (up to ${limit} transactions) and address balance. UTXO transactions are mapped to transfers per counterparty address; received amounts are attributed to input addresses pro rata.`,
        url: new URL(api).origin,
        asOf: now,
      },
    ];

    return {
      chain: "bitcoin",
      address,
      nativeBalance: balanceSats / SATS,
      tokenBalances: [],
      transfers,
      totalTransactions: { value: confirmedCount + info.mempool_stats.tx_count, isLowerBound: false },
      firstActivity,
      lastActivity: transfers.length ? transfers[0].timestamp : null,
      // Bitcoin has no smart contracts: every counterparty is an address-controlled script.
      contractFlags: {},
      subjectIsContract: false,
      truncated,
      sources,
      warnings,
    };
  }
}

export function createBitcoinProvider() {
  return new BitcoinAdapter(config.bitcoinApis);
}
