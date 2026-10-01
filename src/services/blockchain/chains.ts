import type { ChainKey, FutureChainKey } from "@/types/domain";

/**
 * Chain registry (client-safe metadata only — no provider URLs or keys).
 * Adding a chain = add metadata here + an adapter in services/blockchain/<chain>.ts.
 */
export interface ChainMeta {
  key: ChainKey;
  name: string;
  shortName: string;
  family: "evm";
  evmChainId: number;
  nativeSymbol: string;
  nativeName: string;
  explorerName: string;
  explorerUrl: string;
}

export const SUPPORTED_CHAINS: ChainKey[] = ["ethereum", "base", "bsc"];

export const CHAINS: Record<ChainKey, ChainMeta> = {
  ethereum: {
    key: "ethereum",
    name: "Ethereum",
    shortName: "ETH",
    family: "evm",
    evmChainId: 1,
    nativeSymbol: "ETH",
    nativeName: "Ether",
    explorerName: "Etherscan",
    explorerUrl: "https://etherscan.io",
  },
  base: {
    key: "base",
    name: "Base",
    shortName: "Base",
    family: "evm",
    evmChainId: 8453,
    nativeSymbol: "ETH",
    nativeName: "Ether",
    explorerName: "BaseScan",
    explorerUrl: "https://basescan.org",
  },
  bsc: {
    key: "bsc",
    name: "BNB Chain",
    shortName: "BSC",
    family: "evm",
    evmChainId: 56,
    nativeSymbol: "BNB",
    nativeName: "BNB",
    explorerName: "BscScan",
    explorerUrl: "https://bscscan.com",
  },
};

/** Planned chains. Non-EVM chains will need their own address validators and providers. */
export const PLANNED_CHAINS: { key: FutureChainKey; name: string; family: "evm" | "utxo" | "tron" | "solana" }[] = [
  { key: "bitcoin", name: "Bitcoin", family: "utxo" },
  { key: "tron", name: "Tron", family: "tron" },
  { key: "solana", name: "Solana", family: "solana" },
  { key: "polygon", name: "Polygon", family: "evm" },
  { key: "arbitrum", name: "Arbitrum", family: "evm" },
];

export function explorerAddressUrl(chain: ChainKey, address: string) {
  return `${CHAINS[chain].explorerUrl}/address/${address}`;
}

export function explorerTxUrl(chain: ChainKey, hash: string) {
  return `${CHAINS[chain].explorerUrl}/tx/${hash}`;
}
