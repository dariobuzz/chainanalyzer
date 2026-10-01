import type { Asset, ChainKey, CountValue, DataSource, Transfer } from "@/types/domain";

/**
 * Provider-independent raw wallet data. Every blockchain adapter (live or demo)
 * returns this shape; the analysis pipeline never talks to an API directly.
 */
export interface RawWalletData {
  chain: ChainKey;
  address: string;
  nativeBalance: number | null;
  tokenBalances: { asset: Asset; balance: number }[];
  /** Normalized transfers, newest first, without USD values (priced later). */
  transfers: Transfer[];
  totalTransactions: CountValue;
  firstActivity: number | null;
  lastActivity: number | null;
  /** address → isContract, for the counterparties that could be checked. */
  contractFlags: Record<string, boolean>;
  subjectIsContract: boolean | null;
  truncated: boolean;
  sources: DataSource[];
  warnings: string[];
}

export interface FetchOptions {
  maxTransactions: number;
  /** Token contracts whose balance should be fetched (priced tokens). */
  balanceTokens: Asset[];
}

export interface BlockchainProvider {
  readonly id: string;
  readonly chain: ChainKey;
  fetchWalletData(address: string, opts: FetchOptions): Promise<RawWalletData>;
}

/** Etherscan-compatible account history API (implemented by Etherscan V2 and Blockscout). */
export interface ExplorerTx {
  blockNumber: string;
  timeStamp: string;
  hash: string;
  from: string;
  to: string;
  value: string;
  isError?: string;
  txreceipt_status?: string;
  input?: string;
  functionName?: string;
  methodId?: string;
  contractAddress?: string;
  gasUsed?: string;
  gasPrice?: string;
  tokenName?: string;
  tokenSymbol?: string;
  tokenDecimal?: string;
  logIndex?: string;
}

export interface ExplorerClient {
  readonly name: string;
  readonly url: string;
  txList(address: string, limit: number, sort: "asc" | "desc"): Promise<ExplorerTx[]>;
  tokenTxList(address: string, limit: number, sort: "asc" | "desc"): Promise<ExplorerTx[]>;
  internalTxList(address: string, limit: number): Promise<ExplorerTx[]>;
}
