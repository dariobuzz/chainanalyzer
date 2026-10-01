import type { Asset, ChainKey, Direction, Transfer } from "@/types/domain";
import { CHAINS } from "./chains";
import type { ExplorerTx } from "./types";

/** Converts an integer string in base units to a decimal number (precision sufficient for analytics). */
export function toUnits(raw: string | bigint, decimals: number): number {
  let v: bigint;
  try {
    v = typeof raw === "bigint" ? raw : BigInt(raw || "0");
  } catch {
    return 0;
  }
  if (decimals <= 0) return Number(v);
  const base = 10n ** BigInt(decimals);
  const whole = v / base;
  const frac = v % base;
  return Number(whole) + Number(frac) / Number(base);
}

function direction(subject: string, from: string | undefined, to: string | undefined): Direction {
  const f = (from ?? "").toLowerCase();
  const t = (to ?? "").toLowerCase();
  if (f === subject && t === subject) return "self";
  return f === subject ? "out" : "in";
}

function counterpartyOf(subject: string, from: string | undefined, to: string | undefined, d: Direction) {
  if (d === "self") return subject;
  return ((d === "out" ? to : from) ?? "").toLowerCase();
}

export function nativeAsset(chain: ChainKey): Asset {
  const m = CHAINS[chain];
  return { symbol: m.nativeSymbol, name: m.nativeName, contract: null, decimals: m.nativeDecimals, kind: "native" };
}

export function normalizeNativeTxs(chain: ChainKey, subject: string, txs: ExplorerTx[]): Transfer[] {
  const asset = nativeAsset(chain);
  return txs.map((tx) => {
    // Contract creation txs have an empty `to`.
    const to = (tx.to || tx.contractAddress || "").toLowerCase();
    const d = direction(subject, tx.from, to);
    const isError = tx.isError === "1" || tx.txreceipt_status === "0";
    let fee: number | null = null;
    try {
      if (tx.gasUsed && tx.gasPrice) fee = toUnits(BigInt(tx.gasUsed) * BigInt(tx.gasPrice), 18);
    } catch {
      fee = null;
    }
    const fn = tx.functionName ? tx.functionName.split("(")[0] : null;
    const t: Transfer = {
      id: `${tx.hash}:n`,
      hash: (tx.hash ?? "").toLowerCase(),
      timestamp: Number(tx.timeStamp) * 1000,
      blockNumber: Number(tx.blockNumber),
      from: (tx.from ?? "").toLowerCase(),
      to,
      direction: d,
      counterparty: counterpartyOf(subject, tx.from, to, d),
      asset,
      amount: toUnits(tx.value, 18),
      usdValue: null,
      kind: "native",
      method: fn || (tx.input && tx.input !== "0x" ? (tx.methodId ?? tx.input.slice(0, 10)) : null),
      isError,
      feeNative: d === "out" ? fee : null,
    };
    return t;
  });
}

export function normalizeTokenTxs(subject: string, txs: ExplorerTx[]): Transfer[] {
  return txs.map((tx, i) => {
    const d = direction(subject, tx.from, tx.to);
    const decimals = Number(tx.tokenDecimal ?? "18") || 0;
    const contract = (tx.contractAddress ?? "").toLowerCase();
    const t: Transfer = {
      id: `${tx.hash}:t:${tx.logIndex ?? i}:${contract}`,
      hash: (tx.hash ?? "").toLowerCase(),
      timestamp: Number(tx.timeStamp) * 1000,
      blockNumber: Number(tx.blockNumber),
      from: (tx.from ?? "").toLowerCase(),
      to: (tx.to ?? "").toLowerCase(),
      direction: d,
      counterparty: counterpartyOf(subject, tx.from, tx.to, d),
      asset: {
        symbol: (tx.tokenSymbol || "UNKNOWN").slice(0, 16),
        name: tx.tokenName?.slice(0, 64),
        contract,
        decimals,
        kind: "token",
      },
      amount: toUnits(tx.value, decimals),
      usdValue: null,
      kind: "token",
      method: null,
      isError: false,
      feeNative: null,
    };
    return t;
  });
}

export function normalizeInternalTxs(chain: ChainKey, subject: string, txs: ExplorerTx[]): Transfer[] {
  const asset = nativeAsset(chain);
  return txs
    .filter((tx) => tx.value && tx.value !== "0")
    .map((tx, i) => {
      const to = tx.to || tx.contractAddress || "";
      const d = direction(subject, tx.from, to);
      const t: Transfer = {
        id: `${tx.hash}:i:${i}`,
        hash: (tx.hash ?? "").toLowerCase(),
        timestamp: Number(tx.timeStamp) * 1000,
        blockNumber: Number(tx.blockNumber),
        from: (tx.from ?? "").toLowerCase(),
        to: to.toLowerCase(),
        direction: d,
        counterparty: counterpartyOf(subject, tx.from, to, d),
        asset,
        amount: toUnits(tx.value, 18),
        usdValue: null,
        kind: "internal",
        method: null,
        isError: tx.isError === "1",
        feeNative: null,
      };
      return t;
    });
}
