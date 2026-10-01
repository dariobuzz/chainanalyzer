import "server-only";
import { config } from "@/lib/config";
import { EvmChainAdapter } from "./evm-adapter";
import { blockscoutClient, etherscanV2Client } from "./providers/etherscan-compatible";
import { RpcClient } from "./providers/rpc";
import type { ExplorerClient } from "./types";

/** Base mainnet: Etherscan V2 (chainid 8453, if keyed) then Blockscout (keyless fallback); RPC for state. */
export function createBaseProvider() {
  const explorers: ExplorerClient[] = [];
  if (config.etherscanApiKey) explorers.push(etherscanV2Client(8453, config.etherscanApiKey));
  if (config.blockscout.base) explorers.push(blockscoutClient("Blockscout (Base)", config.blockscout.base));
  const rpc = config.rpc.base ? new RpcClient("Base JSON-RPC", config.rpc.base) : null;
  return new EvmChainAdapter("base", explorers, rpc);
}
