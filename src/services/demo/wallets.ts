import type { ChainKey } from "@/types/domain";

/** Client-safe list of preset demo wallets (synthetic addresses). */
export type DemoProfileKey = "low" | "moderate" | "high";

export interface DemoWallet {
  address: string;
  chain: ChainKey;
  profile: DemoProfileKey;
  title: string;
  description: string;
}

export const DEMO_WALLETS: DemoWallet[] = [
  {
    address: "0x4f3a9c2e8b1d7a6f5e4c3b2a1908f7e6d5c4b3a2",
    chain: "ethereum",
    profile: "low",
    title: "Private client – long-standing exchange user",
    description: "Multi-year history, funded mainly from regulated exchanges, occasional DEX use.",
  },
  {
    address: "0x8c1f4e7a2d9b6c3f0e5a8d1b4c7f2e9a6d3b0c58",
    chain: "ethereum",
    profile: "moderate",
    title: "Active DeFi trader",
    description: "High DEX and bridge usage, minor exposure to a high-risk exchange and a gambling service.",
  },
  {
    address: "0xa7e3d9c1b5f2e8a4d6c0b3f7e1a9d5c2b8f4e601",
    chain: "ethereum",
    profile: "high",
    title: "Recently created pass-through wallet",
    description: "Mixer withdrawals, sanctioned-entity exposure, rapid forwarding of funds.",
  },
  {
    address: "0x2b7e5c9a1f3d8e6b4a0c7f2d5e9b1a8c3f6d0e47",
    chain: "base",
    profile: "moderate",
    title: "Base ecosystem user",
    description: "L2 activity with bridging from Ethereum and frequent swaps.",
  },
];

export function findDemoWallet(address: string): DemoWallet | undefined {
  const a = address.toLowerCase();
  return DEMO_WALLETS.find((w) => w.address === a);
}
