import "server-only";

/**
 * Server-side configuration. Values are read from process.env only on the
 * server; nothing in this module is ever bundled for the browser.
 */

function str(name: string, fallback = ""): string {
  const v = process.env[name];
  return v === undefined || v.trim() === "" ? fallback : v.trim();
}

function int(name: string, fallback: number, min = 1, max = Number.MAX_SAFE_INTEGER): number {
  const n = Number.parseInt(str(name), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export const config = {
  demoMode: str("DEMO_MODE", "true").toLowerCase() !== "false",
  etherscanApiKey: str("ETHERSCAN_API_KEY"),
  blockscout: {
    ethereum: str("BLOCKSCOUT_ETHEREUM_URL", "https://eth.blockscout.com/api"),
    base: str("BLOCKSCOUT_BASE_URL", "https://base.blockscout.com/api"),
  },
  rpc: {
    ethereum: str("RPC_ETHEREUM_URL", "https://ethereum-rpc.publicnode.com"),
    base: str("RPC_BASE_URL", "https://mainnet.base.org"),
    bsc: str("RPC_BSC_URL", "https://bsc-dataseed.bnbchain.org"),
  },
  maxTransactions: int("MAX_TRANSACTIONS", 1000, 50, 10000),
  coingecko: {
    apiKey: str("COINGECKO_API_KEY"),
    apiUrl: str("COINGECKO_API_URL", "https://api.coingecko.com/api/v3"),
  },
  databaseUrl: str("DATABASE_URL"),
  databaseSsl: str("DATABASE_SSL", "false").toLowerCase() === "true",
  cacheTtlMinutes: int("ANALYSIS_CACHE_TTL_MINUTES", 30, 1, 60 * 24 * 7),
  rateLimit: {
    analysisPerMinute: int("RATE_LIMIT_ANALYSIS_PER_MINUTE", 20),
    apiPerMinute: int("RATE_LIMIT_API_PER_MINUTE", 120),
  },
} as const;

/** Public, non-secret view of the configuration (safe to render in Settings). */
export function publicConfigStatus() {
  return {
    demoMode: config.demoMode,
    etherscanConfigured: Boolean(config.etherscanApiKey),
    coingeckoKeyConfigured: Boolean(config.coingecko.apiKey),
    storage: config.databaseUrl ? "PostgreSQL" : "Local JSON files (./data/runtime)",
    cacheTtlMinutes: config.cacheTtlMinutes,
    maxTransactions: config.maxTransactions,
    rateLimit: config.rateLimit,
  };
}
