import "server-only";
import { config } from "@/lib/config";
import { EvmChainAdapter } from "./evm-adapter";
import { blockscoutClient, etherscanV2Client } from "./providers/etherscan-compatible";
import { RpcClient } from "./providers/rpc";
import type { ExplorerClient } from "./types";

/** Ethereum mainnet: Etherscan V2 (if keyed) then Blockscout (keyless fallback); RPC for state. */
export function createEthereumProvider() {
  const explorers: ExplorerClient[] = [];
  if (config.etherscanApiKey) explorers.push(etherscanV2Client(1, config.etherscanApiKey));
  if (config.blockscout.ethereum) explorers.push(blockscoutClient("Blockscout (Ethereum)", config.blockscout.ethereum));
  const rpc = config.rpc.ethereum ? new RpcClient("Ethereum JSON-RPC", config.rpc.ethereum) : null;
  return new EvmChainAdapter("ethereum", explorers, rpc);
}
