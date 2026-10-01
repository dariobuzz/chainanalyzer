import "server-only";
import type { Asset, DataSource, Transfer } from "@/types/domain";
import { config } from "@/lib/config";
import { PublicError } from "@/lib/security/errors";
import { KNOWN_TOKENS } from "@/services/pricing/prices";
import { nativeAsset, toUnits } from "./normalize";
import { ProviderError, fetchJsonRetry, sleep, timeBudget } from "./providers/http";
import type { BlockchainProvider, FetchOptions, RawWalletData } from "./types";

interface RpcResponse<T> {
  id: number;
  result?: T;
  error?: { code: number; message: string };
}

interface SignatureInfo {
  signature: string;
  slot: number;
  blockTime: number | null;
  err: unknown;
}

interface ParsedIx {
  program?: string;
  programId: string;
  parsed?: { type?: string; info?: Record<string, unknown> } | string;
}

interface TokenBalance {
  accountIndex: number;
  mint: string;
  owner?: string;
  uiTokenAmount: { amount: string; decimals: number };
}

interface ParsedTx {
  slot: number;
  blockTime: number | null;
  meta: {
    err: unknown;
    fee: number;
    preTokenBalances?: TokenBalance[];
    postTokenBalances?: TokenBalance[];
    innerInstructions?: { instructions: ParsedIx[] }[];
  } | null;
  transaction: {
    signatures: string[];
    message: { accountKeys: { pubkey: string; signer: boolean }[]; instructions: ParsedIx[] };
  };
}

const LAMPORTS = 1e9;
const SIGNATURE_PAGE = 1000;
/** Extra signature pages fetched (cheap) to count history and find the first activity. */
const MAX_SIGNATURE_PAGES = 3;
const PUBLIC_RPC = "api.mainnet-beta.solana.com";
/**
 * The public endpoint serves only ~10 getTransaction calls per ~10 s per IP: it is
 * queried gently and without retries (a 429 ends the fetch); dedicated RPCs are batched.
 */
const PACING = { public: { batch: 5, delayMs: 1000, retries: 0 }, dedicated: { batch: 20, delayMs: 0, retries: 3 } };
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

/** Infrastructure programs that are never the meaningful counterparty of a transaction. */
const INFRA_PROGRAMS = new Set([
  "11111111111111111111111111111111",
  "ComputeBudget111111111111111111111111111111",
  TOKEN_PROGRAM,
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
  "Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo",
]);

const knownMints = new Map(KNOWN_TOKENS.solana.map((k) => [k.asset.contract!, k.asset]));

function splAsset(mint: string, decimals: number): Asset {
  return knownMints.get(mint) ?? { symbol: `${mint.slice(0, 4)}…`, name: `SPL token ${mint}`, contract: mint, decimals, kind: "token" };
}

const info = (ix: ParsedIx) => (typeof ix.parsed === "object" ? (ix.parsed.info ?? {}) : {});
const ixType = (ix: ParsedIx) => (typeof ix.parsed === "object" ? ix.parsed.type : undefined);
const str = (v: unknown) => (typeof v === "string" ? v : "");

/**
 * Extracts the subject's value movements from a parsed transaction:
 * system-program SOL transfers and SPL token transfers (token accounts resolved
 * to their owners). Transactions without such a movement (e.g. program calls,
 * airdrops of new accounts) yield a zero-value record so that interactions are
 * still counted, as with EVM contract calls.
 */
export function solanaTransfers(subject: string, tx: ParsedTx, programs: Set<string>): Transfer[] {
  const sig = tx.transaction.signatures[0];
  const keys = tx.transaction.message.accountKeys;
  const meta = tx.meta;
  const tokenAccounts = new Map<string, { owner: string; mint: string; decimals: number }>();
  for (const b of [...(meta?.preTokenBalances ?? []), ...(meta?.postTokenBalances ?? [])]) {
    const acct = keys[b.accountIndex]?.pubkey;
    if (acct && b.owner) tokenAccounts.set(acct, { owner: b.owner, mint: b.mint, decimals: b.uiTokenAmount.decimals });
  }
  const ixs = [...tx.transaction.message.instructions, ...(meta?.innerInstructions ?? []).flatMap((i) => i.instructions)];
  for (const ix of tx.transaction.message.instructions) if (!INFRA_PROGRAMS.has(ix.programId)) programs.add(ix.programId);

  const base = {
    hash: sig,
    timestamp: (tx.blockTime ?? 0) * 1000,
    blockNumber: tx.slot,
    usdValue: null,
    isError: meta?.err != null,
  };
  const out: Transfer[] = [];
  const push = (from: string, to: string, asset: Asset, amount: number, kind: Transfer["kind"], method: string | null) => {
    if (from !== subject && to !== subject) return;
    const direction = from === subject && to === subject ? "self" : from === subject ? "out" : "in";
    out.push({
      ...base,
      id: `${sig}:${out.length}`,
      from,
      to,
      direction,
      counterparty: direction === "self" ? subject : direction === "out" ? to : from,
      asset,
      amount,
      kind,
      method,
      feeNative: null,
    });
  };

  for (const ix of ixs) {
    const t = ixType(ix);
    const i = info(ix);
    if (ix.program === "system" && (t === "transfer" || t === "transferWithSeed")) {
      const dst = str(i.destination);
      // Wrapping SOL into the subject's own token account is not a movement to a third party.
      if (str(i.source) === subject && tokenAccounts.get(dst)?.owner === subject) continue;
      push(str(i.source), dst, nativeAsset("solana"), Number(i.lamports ?? 0) / LAMPORTS, "native", null);
    } else if (ix.program === "spl-token" && (t === "transfer" || t === "transferChecked")) {
      const src = tokenAccounts.get(str(i.source));
      const dst = tokenAccounts.get(str(i.destination));
      const mint = str(i.mint) || src?.mint || dst?.mint;
      if (!mint) continue;
      const amt = i.tokenAmount as { amount?: string; decimals?: number } | undefined;
      const decimals = amt?.decimals ?? src?.decimals ?? dst?.decimals ?? 0;
      const from = src?.owner ?? (str(i.authority) || str(i.multisigAuthority) || str(i.source));
      const to = dst?.owner ?? str(i.destination);
      push(from, to, splAsset(mint, decimals), toUnits(str(i.amount) || amt?.amount || "0", decimals), "token", null);
    }
  }

  const feePayer = keys[0]?.pubkey;
  if (out.length === 0) {
    const signer = keys.some((k) => k.pubkey === subject && k.signer);
    const program = tx.transaction.message.instructions.find((ix) => !INFRA_PROGRAMS.has(ix.programId));
    if (signer && program) push(subject, program.programId, nativeAsset("solana"), 0, "native", ixType(program) ?? program.program ?? null);
    else if (feePayer && feePayer !== subject) push(feePayer, subject, nativeAsset("solana"), 0, "native", null);
  }
  if (feePayer === subject && meta) {
    const first = out.find((t) => t.direction !== "in");
    if (first) first.feeNative = meta.fee / LAMPORTS;
  }
  return out;
}

/** Solana adapter on standard JSON-RPC (public endpoint by default; a dedicated RPC is recommended). */
export class SolanaAdapter implements BlockchainProvider {
  readonly id = "solana:solana";
  readonly chain = "solana" as const;

  constructor(private readonly url: string) {}

  private get name() {
    return `Solana JSON-RPC (${new URL(this.url).host})`;
  }

  private async call<T>(method: string, params: unknown[]): Promise<T> {
    const json = await fetchJsonRetry<RpcResponse<T>>(this.url, {
      provider: this.name,
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    if (json.error || json.result === undefined) throw new ProviderError(`${this.name}: ${json.error?.message ?? "empty result"}`, this.name);
    return json.result;
  }

  private async batch<T>(method: string, paramsList: unknown[][], retries: number, timeoutMs: number): Promise<(T | null)[]> {
    const json = await fetchJsonRetry<RpcResponse<T>[]>(
      this.url,
      {
        provider: this.name,
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(paramsList.map((params, id) => ({ jsonrpc: "2.0", id, method, params }))),
        timeoutMs,
      },
      retries,
    );
    if (!Array.isArray(json)) throw new ProviderError(`${this.name}: batch requests unsupported`, this.name);
    const byId = new Map(json.map((r) => [r.id, r.result ?? null]));
    return paramsList.map((_, id) => byId.get(id) ?? null);
  }

  async fetchWalletData(address: string, opts: FetchOptions): Promise<RawWalletData> {
    const warnings: string[] = [];
    const limit = Math.min(opts.maxTransactions, config.maxTransactionsSolana);
    const budget = timeBudget(config.historyTimeBudgetMs);

    // 1. Signatures: cheap, used for the transaction count and first activity.
    const sigs: SignatureInfo[] = [];
    let complete = false;
    try {
      for (let page = 0; page < MAX_SIGNATURE_PAGES; page++) {
        const before = sigs.length ? sigs[sigs.length - 1].signature : undefined;
        const rows = await this.call<SignatureInfo[]>("getSignaturesForAddress", [address, { limit: SIGNATURE_PAGE, ...(before ? { before } : {}) }]);
        sigs.push(...rows);
        if (rows.length < SIGNATURE_PAGE) {
          complete = true;
          break;
        }
        if (budget.expired()) break;
      }
    } catch (e) {
      const reason = (e as Error).message;
      const hint = /429/.test(reason) ? " The public Solana RPC rate limit was reached: configure RPC_SOLANA_URL with a dedicated endpoint, or retry in a minute." : "";
      throw new PublicError(`Solana data provider unavailable. ${reason}.${hint}`, 502, "provider_unavailable");
    }

    // 2. Parsed transactions for the most recent signatures, within the time budget.
    const wanted = sigs.slice(0, limit).map((s) => s.signature);
    const txs: ParsedTx[] = [];
    let missing = 0;
    const pace = new URL(this.url).host === PUBLIC_RPC ? PACING.public : PACING.dedicated;
    for (let i = 0; i < wanted.length; i += pace.batch) {
      if (i > 0 && pace.delayMs) await sleep(pace.delayMs);
      if (budget.expired()) {
        warnings.push(`Transaction details fetched for ${txs.length} of ${wanted.length} recent signatures (time budget reached).`);
        break;
      }
      const chunk = wanted.slice(i, i + pace.batch);
      try {
        const res = await this.batch<ParsedTx>(
          "getTransaction",
          chunk.map((s) => [s, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0, commitment: "confirmed" }]),
          pace.retries,
          budget.timeout(3000),
        );
        for (const r of res) {
          if (r) txs.push(r);
          else missing++;
        }
      } catch (e) {
        warnings.push(`Transaction details unavailable after ${txs.length} transactions: ${(e as Error).message}.`);
        break;
      }
    }
    if (missing) warnings.push(`${missing} transactions could not be retrieved from the RPC endpoint (rate limit or pruned history).`);
    if (sigs.length && !txs.length) {
      throw new PublicError("Solana transaction details unavailable (RPC rate limit). Configure RPC_SOLANA_URL with a dedicated endpoint, or retry in a minute.", 502, "provider_unavailable");
    }

    const programs = new Set<string>();
    const transfers = txs.flatMap((tx) => solanaTransfers(address, tx, programs)).sort((a, b) => b.timestamp - a.timestamp);
    const truncated = !complete || txs.length < sigs.length;

    // 3. Balances and program detection.
    const counts = new Map<string, number>();
    for (const t of transfers) if (t.counterparty !== address) counts.set(t.counterparty, (counts.get(t.counterparty) ?? 0) + 1);
    const toCheck = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 99).map(([a]) => a);
    const [balance, tokenAccounts, accounts] = await Promise.all([
      this.call<{ value: number }>("getBalance", [address]).catch(() => null),
      this.call<{ value: { account: { data: { parsed: { info: { mint: string; tokenAmount: { amount: string } } } } } }[] }>("getTokenAccountsByOwner", [
        address,
        { programId: TOKEN_PROGRAM },
        { encoding: "jsonParsed" },
      ]).catch(() => null),
      this.call<{ value: ({ executable: boolean; owner: string } | null)[] }>("getMultipleAccounts", [
        [address, ...toCheck],
        { encoding: "base64", dataSlice: { offset: 0, length: 0 } },
      ]).catch(() => null),
    ]);
    if (!balance) warnings.push("SOL balance unavailable from RPC.");
    if (pace === PACING.public && txs.length < wanted.length) {
      warnings.push("The public Solana RPC is heavily rate limited: set RPC_SOLANA_URL to a dedicated endpoint to analyze a deeper history.");
    }

    const tokenBalances: RawWalletData["tokenBalances"] = [];
    const heldRaw = new Map<string, bigint>();
    for (const a of tokenAccounts?.value ?? []) {
      const { mint, tokenAmount } = a.account.data.parsed.info;
      heldRaw.set(mint, (heldRaw.get(mint) ?? 0n) + BigInt(tokenAmount.amount));
    }
    for (const asset of opts.balanceTokens) {
      const raw = asset.contract ? heldRaw.get(asset.contract) : undefined;
      if (raw && raw > 0n) tokenBalances.push({ asset, balance: toUnits(raw, asset.decimals) });
    }

    const contractFlags: Record<string, boolean> = {};
    for (const p of programs) contractFlags[p] = true;
    let subjectIsContract: boolean | null = null;
    accounts?.value.forEach((acc, i) => {
      if (!acc) return;
      // Executable programs and program-owned accounts (pools, vaults, PDAs) are contract-controlled.
      const isContract = acc.executable || acc.owner !== "11111111111111111111111111111111";
      if (i === 0) subjectIsContract = acc.executable;
      else contractFlags[toCheck[i - 1]] = isContract;
    });

    const blockTimes = sigs.map((s) => s.blockTime).filter((t): t is number => t !== null);
    const now = new Date().toISOString();
    const sources: DataSource[] = [
      {
        name: this.name,
        kind: "blockchain",
        detail: `Solana signatures (up to ${MAX_SIGNATURE_PAGES * SIGNATURE_PAGE}) and parsed transactions (up to ${limit}): SOL and SPL token transfers, program interactions, balances.`,
        url: new URL(this.url).origin,
        asOf: now,
      },
    ];

    return {
      chain: "solana",
      address,
      nativeBalance: balance ? balance.value / LAMPORTS : null,
      tokenBalances,
      transfers,
      totalTransactions: { value: sigs.length, isLowerBound: !complete },
      firstActivity: complete && blockTimes.length ? Math.min(...blockTimes) * 1000 : null,
      lastActivity: transfers.length ? transfers[0].timestamp : blockTimes.length ? Math.max(...blockTimes) * 1000 : null,
      contractFlags,
      subjectIsContract,
      truncated,
      sources,
      warnings,
    };
  }
}

export function createSolanaProvider() {
  return new SolanaAdapter(config.rpc.solana);
}
