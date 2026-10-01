import "server-only";
import type { ChainKey, DataSource, Transfer } from "@/types/domain";
import { CHAINS } from "./chains";
import { normalizeInternalTxs, normalizeNativeTxs, normalizeTokenTxs, toUnits } from "./normalize";
import type { BlockchainProvider, ExplorerClient, FetchOptions, RawWalletData } from "./types";
import type { RpcClient } from "./providers/rpc";
import { PublicError } from "@/lib/security/errors";

/** Max counterparties checked for bytecode (contract vs. wallet) per analysis. */
const CONTRACT_CHECK_LIMIT = 60;

/**
 * Generic EVM adapter: account history from one or more Etherscan-compatible
 * explorers (first that succeeds wins), balances & bytecode from JSON-RPC.
 */
export class EvmChainAdapter implements BlockchainProvider {
  readonly id: string;

  constructor(
    readonly chain: ChainKey,
    private readonly explorers: ExplorerClient[],
    private readonly rpc: RpcClient | null,
  ) {
    this.id = `evm:${chain}`;
    if (explorers.length === 0) {
      throw new PublicError(
        `Live data for ${CHAINS[chain].name} requires an explorer API key (set ETHERSCAN_API_KEY) or DEMO_MODE=true.`,
        503,
        "provider_not_configured",
      );
    }
  }

  async fetchWalletData(address: string, opts: FetchOptions): Promise<RawWalletData> {
    const warnings: string[] = [];
    const limit = opts.maxTransactions;

    // 1. Account history: try explorers in priority order.
    let explorer: ExplorerClient | null = null;
    let normal: Transfer[] = [];
    let tokens: Transfer[] = [];
    let internal: Transfer[] = [];
    let lastErr: unknown = null;
    for (const ex of this.explorers) {
      try {
        const [n, t, i] = await Promise.all([
          ex.txList(address, limit, "desc"),
          ex.tokenTxList(address, limit, "desc"),
          ex.internalTxList(address, limit).catch(() => {
            warnings.push(`Internal transactions unavailable from ${ex.name}.`);
            return [];
          }),
        ]);
        normal = normalizeNativeTxs(this.chain, address, n);
        tokens = normalizeTokenTxs(address, t);
        internal = normalizeInternalTxs(this.chain, address, i);
        explorer = ex;
        break;
      } catch (e) {
        lastErr = e;
        warnings.push(`${ex.name} unavailable: ${(e as Error).message}`);
      }
    }
    if (!explorer) {
      const reason = (lastErr as Error)?.message ?? "";
      const hint = /429|rate limit|too many/i.test(reason)
        ? " The public keyless API rate limit was reached: configure ETHERSCAN_API_KEY for reliable live data, or retry in a minute."
        : "";
      throw new PublicError(
        `Blockchain data provider unavailable for ${CHAINS[this.chain].name}. ${reason}.${hint}`.trim(),
        502,
        "provider_unavailable",
      );
    }

    const truncated = normal.length >= limit || tokens.length >= limit || internal.length >= limit;
    const transfers = [...normal, ...tokens, ...internal].sort((a, b) => b.timestamp - a.timestamp);
    const uniqueHashes = new Set(transfers.map((t) => t.hash));

    // 2. First activity: when history is truncated, ask for the oldest records explicitly.
    let firstActivity = transfers.length ? Math.min(...transfers.map((t) => t.timestamp)) : null;
    if (truncated) {
      try {
        const [n0, t0] = await Promise.all([explorer.txList(address, 1, "asc"), explorer.tokenTxList(address, 1, "asc")]);
        const ts = [...n0, ...t0].map((t) => Number(t.timeStamp) * 1000).filter(Boolean);
        if (ts.length) firstActivity = Math.min(...ts);
      } catch {
        warnings.push("First activity date could not be confirmed (history truncated).");
      }
    }

    // 3. Balances and contract detection via RPC.
    let nativeBalance: number | null = null;
    const tokenBalances: RawWalletData["tokenBalances"] = [];
    let contractFlags: Record<string, boolean> = {};
    let subjectIsContract: boolean | null = null;
    if (this.rpc) {
      const counts = new Map<string, number>();
      for (const t of transfers) if (t.counterparty !== address) counts.set(t.counterparty, (counts.get(t.counterparty) ?? 0) + 1);
      const toCheck = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, CONTRACT_CHECK_LIMIT)
        .map(([a]) => a);
      const seenTokens = new Set(tokens.map((t) => t.asset.contract));
      const balanceTokens = opts.balanceTokens.filter((a) => a.contract && seenTokens.has(a.contract));
      const [bal, flags, erc20] = await Promise.all([
        this.rpc.getBalanceWei(address).catch(() => null),
        this.rpc.getContractFlags([address, ...toCheck]).catch(() => ({}) as Record<string, boolean>),
        this.rpc
          .getErc20Balances(
            address,
            balanceTokens.map((a) => a.contract!),
          )
          .catch(() => ({}) as Record<string, bigint>),
      ]);
      if (bal === null) warnings.push("Native balance unavailable from RPC.");
      else nativeBalance = toUnits(bal, 18);
      subjectIsContract = flags[address] ?? null;
      delete flags[address];
      contractFlags = flags;
      for (const a of balanceTokens) {
        const raw = erc20[a.contract!];
        if (raw !== undefined && raw > 0n) tokenBalances.push({ asset: a, balance: toUnits(raw, a.decimals) });
      }
    } else {
      warnings.push("No RPC endpoint configured: balances and contract detection unavailable.");
    }

    const now = new Date().toISOString();
    const sources: DataSource[] = [
      {
        name: explorer.name,
        kind: "blockchain",
        detail: `Transaction history for ${CHAINS[this.chain].name} (normal, token and internal transfers, up to ${limit} per type).`,
        url: new URL(explorer.url).origin,
        asOf: now,
      },
    ];
    if (this.rpc) {
      sources.push({
        name: this.rpc.name,
        kind: "blockchain",
        detail: "Live native balance, token balances and contract bytecode checks via JSON-RPC.",
        asOf: now,
      });
    }

    return {
      chain: this.chain,
      address,
      nativeBalance,
      tokenBalances,
      transfers,
      totalTransactions: { value: uniqueHashes.size, isLowerBound: truncated },
      firstActivity,
      lastActivity: transfers.length ? transfers[0].timestamp : null,
      contractFlags,
      subjectIsContract,
      truncated,
      sources,
      warnings,
    };
  }
}
