import "server-only";
import type { ChainKey } from "@/types/domain";
import { createBaseProvider } from "./base";
import { createBitcoinProvider } from "./bitcoin";
import { createBscProvider } from "./bsc";
import { createEthereumProvider } from "./ethereum";
import { createSolanaProvider } from "./solana";
import { createTronProvider } from "./tron";
import type { BlockchainProvider } from "./types";

/**
 * Provider registry. The rest of the application depends only on the
 * BlockchainProvider interface: swapping APIs means changing the per-chain
 * factory, nothing else.
 */
const factories: Record<ChainKey, () => BlockchainProvider> = {
  ethereum: createEthereumProvider,
  base: createBaseProvider,
  bsc: createBscProvider,
  bitcoin: createBitcoinProvider,
  tron: createTronProvider,
  solana: createSolanaProvider,
};

export function getLiveProvider(chain: ChainKey): BlockchainProvider {
  return factories[chain]();
}

export type { BlockchainProvider, RawWalletData } from "./types";
