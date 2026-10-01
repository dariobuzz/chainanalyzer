import type { ChainFamily, ChainKey, FutureChainKey } from "@/types/domain";

/**
 * Chain registry (client-safe metadata only — no provider URLs or keys).
 * Adding a chain = add metadata here + an adapter in services/blockchain/<chain>.ts
 * + an address format in lib/addresses.ts (non-EVM families).
 */
export interface ChainMeta {
  key: ChainKey;
  name: string;
  shortName: string;
  family: ChainFamily;
  /** EVM chain id (EVM family only). */
  evmChainId?: number;
  nativeSymbol: string;
  nativeName: string;
  nativeDecimals: number;
  explorerName: string;
  explorerUrl: string;
  /** Explorer path templates; `{a}` / `{h}` are replaced by the address / tx hash. */
  explorerAddressPath: string;
  explorerTxPath: string;
}

export const SUPPORTED_CHAINS: ChainKey[] = ["ethereum", "base", "bsc", "bitcoin", "tron", "solana"];

const EVM_PATHS = { explorerAddressPath: "/address/{a}", explorerTxPath: "/tx/{h}" };

export const CHAINS: Record<ChainKey, ChainMeta> = {
  ethereum: {
    key: "ethereum",
    name: "Ethereum",
    shortName: "ETH",
    family: "evm",
    evmChainId: 1,
    nativeSymbol: "ETH",
    nativeName: "Ether",
    nativeDecimals: 18,
    explorerName: "Etherscan",
    explorerUrl: "https://etherscan.io",
    ...EVM_PATHS,
  },
  base: {
    key: "base",
    name: "Base",
    shortName: "Base",
    family: "evm",
    evmChainId: 8453,
    nativeSymbol: "ETH",
    nativeName: "Ether",
    nativeDecimals: 18,
    explorerName: "BaseScan",
    explorerUrl: "https://basescan.org",
    ...EVM_PATHS,
  },
  bsc: {
    key: "bsc",
    name: "BNB Chain",
    shortName: "BSC",
    family: "evm",
    evmChainId: 56,
    nativeSymbol: "BNB",
    nativeName: "BNB",
    nativeDecimals: 18,
    explorerName: "BscScan",
    explorerUrl: "https://bscscan.com",
    ...EVM_PATHS,
  },
  bitcoin: {
    key: "bitcoin",
    name: "Bitcoin",
    shortName: "BTC",
    family: "utxo",
    nativeSymbol: "BTC",
    nativeName: "Bitcoin",
    nativeDecimals: 8,
    explorerName: "mempool.space",
    explorerUrl: "https://mempool.space",
    explorerAddressPath: "/address/{a}",
    explorerTxPath: "/tx/{h}",
  },
  tron: {
    key: "tron",
    name: "Tron",
    shortName: "TRX",
    family: "tron",
    nativeSymbol: "TRX",
    nativeName: "Tronix",
    nativeDecimals: 6,
    explorerName: "Tronscan",
    explorerUrl: "https://tronscan.org",
    explorerAddressPath: "/#/address/{a}",
    explorerTxPath: "/#/transaction/{h}",
  },
  solana: {
    key: "solana",
    name: "Solana",
    shortName: "SOL",
    family: "solana",
    nativeSymbol: "SOL",
    nativeName: "Solana",
    nativeDecimals: 9,
    explorerName: "Solscan",
    explorerUrl: "https://solscan.io",
    explorerAddressPath: "/account/{a}",
    explorerTxPath: "/tx/{h}",
  },
};

export const FAMILY_LABEL: Record<ChainFamily, string> = {
  evm: "EVM",
  utxo: "UTXO",
  tron: "Tron (TVM)",
  solana: "Solana (SVM)",
};

export function isEvmChain(chain: ChainKey) {
  return CHAINS[chain].family === "evm";
}

/** Planned chains. */
export const PLANNED_CHAINS: { key: FutureChainKey; name: string; family: ChainFamily }[] = [
  { key: "polygon", name: "Polygon", family: "evm" },
  { key: "arbitrum", name: "Arbitrum", family: "evm" },
];

export function explorerAddressUrl(chain: ChainKey, address: string) {
  const m = CHAINS[chain];
  return m.explorerUrl + m.explorerAddressPath.replace("{a}", encodeURIComponent(address));
}

export function explorerTxUrl(chain: ChainKey, hash: string) {
  const m = CHAINS[chain];
  return m.explorerUrl + m.explorerTxPath.replace("{h}", encodeURIComponent(hash));
}
