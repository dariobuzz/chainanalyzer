import "server-only";
import type { Asset, ChainKey, DataSource } from "@/types/domain";
import { config } from "@/lib/config";
import { fetchJson } from "@/services/blockchain/providers/http";

/**
 * Pricing service.
 * Tokens are priced ONLY by verified contract address (never by symbol) to
 * avoid valuing spoofed tokens (e.g. fake "USDT" airdrops).
 * MVP limitation: current spot prices are applied to historical transfers.
 */

type PriceRef = "usd_peg" | "ethereum" | "binancecoin" | "bitcoin";

interface KnownToken {
  asset: Asset;
  price: PriceRef;
}

const tok = (symbol: string, contract: string, decimals: number, price: PriceRef, name?: string): KnownToken => ({
  asset: { symbol, name, contract: contract.toLowerCase(), decimals, kind: "token" },
  price,
});

export const KNOWN_TOKENS: Record<ChainKey, KnownToken[]> = {
  ethereum: [
    tok("USDT", "0xdac17f958d2ee523a2206206994597c13d831ec7", 6, "usd_peg", "Tether USD"),
    tok("USDC", "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", 6, "usd_peg", "USD Coin"),
    tok("DAI", "0x6b175474e89094c44da98b954eedeac495271d0f", 18, "usd_peg", "Dai Stablecoin"),
    tok("WETH", "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", 18, "ethereum", "Wrapped Ether"),
    tok("WBTC", "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599", 8, "bitcoin", "Wrapped BTC"),
  ],
  base: [
    tok("USDC", "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", 6, "usd_peg", "USD Coin"),
    tok("USDbC", "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca", 6, "usd_peg", "USD Base Coin"),
    tok("DAI", "0x50c5725949a6f0c72e6c4a641f24049a917db0cb", 18, "usd_peg", "Dai Stablecoin"),
    tok("WETH", "0x4200000000000000000000000000000000000006", 18, "ethereum", "Wrapped Ether"),
  ],
  bsc: [
    tok("USDT", "0x55d398326f99059ff775485246999027b3197955", 18, "usd_peg", "Tether USD (BSC)"),
    tok("USDC", "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", 18, "usd_peg", "USD Coin (BSC)"),
    tok("BUSD", "0xe9e7cea3dedca5984780bafc599bd69add087d56", 18, "usd_peg", "Binance USD"),
    tok("WBNB", "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c", 18, "binancecoin", "Wrapped BNB"),
    tok("ETH", "0x2170ed0880ac9a755fd29b2688956bd959f933f8", 18, "ethereum", "Binance-Peg Ether"),
    tok("BTCB", "0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c", 18, "bitcoin", "Binance-Peg BTC"),
  ],
};

const NATIVE_REF: Record<ChainKey, PriceRef> = { ethereum: "ethereum", base: "ethereum", bsc: "binancecoin" };

export interface PriceBook {
  /** USD price of each reference asset; null when unavailable. */
  refs: Record<Exclude<PriceRef, "usd_peg">, number | null>;
  source: string;
  asOf: string;
  demo: boolean;
}

export const DEMO_PRICES: PriceBook = {
  refs: { ethereum: 2450, binancecoin: 590, bitcoin: 64000 },
  source: "Demo price table (fixed, illustrative)",
  asOf: "demo",
  demo: true,
};

let cached: { at: number; book: PriceBook } | null = null;
const PRICE_TTL_MS = 5 * 60_000;

export async function getLivePriceBook(): Promise<{ book: PriceBook; warning?: string }> {
  if (cached && Date.now() - cached.at < PRICE_TTL_MS) return { book: cached.book };
  const headers: Record<string, string> = { accept: "application/json" };
  if (config.coingecko.apiKey) {
    const isPro = config.coingecko.apiUrl.includes("pro-api");
    headers[isPro ? "x-cg-pro-api-key" : "x-cg-demo-api-key"] = config.coingecko.apiKey;
  }
  try {
    const data = await fetchJson<Record<string, { usd?: number }>>(
      `${config.coingecko.apiUrl}/simple/price?ids=ethereum,binancecoin,bitcoin&vs_currencies=usd`,
      { provider: "CoinGecko", headers, timeoutMs: 8000 },
    );
    const book: PriceBook = {
      refs: {
        ethereum: data.ethereum?.usd ?? null,
        binancecoin: data.binancecoin?.usd ?? null,
        bitcoin: data.bitcoin?.usd ?? null,
      },
      source: "CoinGecko spot prices",
      asOf: new Date().toISOString(),
      demo: false,
    };
    cached = { at: Date.now(), book };
    return { book };
  } catch (e) {
    return {
      book: { refs: { ethereum: null, binancecoin: null, bitcoin: null }, source: "Unavailable", asOf: new Date().toISOString(), demo: false },
      warning: `Price data unavailable (${(e as Error).message}); USD values are not shown.`,
    };
  }
}

function refPrice(book: PriceBook, ref: PriceRef): number | null {
  return ref === "usd_peg" ? 1 : book.refs[ref];
}

export function nativePrice(book: PriceBook, chain: ChainKey): number | null {
  return refPrice(book, NATIVE_REF[chain]);
}

/** USD price for an asset, or null if the asset is not a verified, priced token. */
export function assetPrice(book: PriceBook, chain: ChainKey, asset: Asset): number | null {
  if (asset.kind === "native") return nativePrice(book, chain);
  const known = KNOWN_TOKENS[chain].find((k) => k.asset.contract === asset.contract);
  return known ? refPrice(book, known.price) : null;
}

export function pricedTokenAssets(chain: ChainKey): Asset[] {
  return KNOWN_TOKENS[chain].map((k) => k.asset);
}

export function pricingDataSource(book: PriceBook): DataSource {
  return {
    name: book.source,
    kind: "pricing",
    detail: book.demo
      ? "Fixed illustrative prices used for demo data."
      : "Spot USD prices for native assets and verified major tokens (by contract). Stablecoins valued at USD 1. Current prices are applied to historical transfers.",
    url: book.demo ? undefined : "https://www.coingecko.com",
    asOf: book.asOf,
  };
}
