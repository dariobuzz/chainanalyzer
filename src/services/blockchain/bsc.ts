import "server-only";
import { config } from "@/lib/config";
import { EvmChainAdapter } from "./evm-adapter";
import { etherscanV2Client } from "./providers/etherscan-compatible";
import { RpcClient } from "./providers/rpc";
import type { ExplorerClient } from "./types";

/** BNB Smart Chain: Etherscan V2 (chainid 56), requires ETHERSCAN_API_KEY; RPC for state. */
export function createBscProvider() {
  const explorers: ExplorerClient[] = [];
  if (config.etherscanApiKey) explorers.push(etherscanV2Client(56, config.etherscanApiKey));
  const rpc = config.rpc.bsc ? new RpcClient("BNB Chain JSON-RPC", config.rpc.bsc) : null;
  return new EvmChainAdapter("bsc", explorers, rpc);
}
