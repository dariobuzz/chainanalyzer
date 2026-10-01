import "server-only";
import type { ExplorerClient, ExplorerTx } from "../types";
import { ProviderError, fetchJson, sleep } from "./http";

interface EtherscanResponse {
  status: string;
  message: string;
  result: ExplorerTx[] | string | null;
}

/**
 * Client for the Etherscan "account" API dialect, shared by Etherscan V2
 * (multichain, API key) and Blockscout (keyless).
 */
export class EtherscanCompatibleClient implements ExplorerClient {
  constructor(
    public readonly name: string,
    public readonly url: string,
    private readonly extraParams: Record<string, string> = {},
  ) {}

  private async call(params: Record<string, string>, attempt = 0): Promise<ExplorerTx[]> {
    const qs = new URLSearchParams({ ...this.extraParams, ...params });
    let json: EtherscanResponse;
    try {
      json = await fetchJson<EtherscanResponse>(`${this.url}?${qs}`, { provider: this.name });
    } catch (e) {
      // Keyless/free tiers rate-limit aggressively: back off and retry.
      if (/HTTP 429/.test((e as Error).message) && attempt < 3) {
        await sleep(1500 * (attempt + 1));
        return this.call(params, attempt + 1);
      }
      throw e;
    }
    if (json.status === "1" && Array.isArray(json.result)) return json.result;
    // Blockscout may flag partial results (e.g. "not yet processed") with status "0" while still returning data.
    if (Array.isArray(json.result) && json.result.length > 0) return json.result;
    const msg = typeof json.result === "string" ? json.result : json.message;
    if (/no (transactions|records) found/i.test(json.message) || (Array.isArray(json.result) && json.result.length === 0)) {
      return [];
    }
    if (/rate limit|too many requests/i.test(msg ?? "") && attempt < 3) {
      await sleep(1100 * (attempt + 1));
      return this.call(params, attempt + 1);
    }
    // Sanitize: strip anything resembling a key before surfacing.
    throw new ProviderError(`${this.name}: ${String(msg ?? "unknown error").replace(/[A-Z0-9]{30,}/g, "***")}`, this.name);
  }

  txList(address: string, limit: number, sort: "asc" | "desc") {
    return this.call({ module: "account", action: "txlist", address, startblock: "0", endblock: "99999999", page: "1", offset: String(limit), sort });
  }

  tokenTxList(address: string, limit: number, sort: "asc" | "desc") {
    return this.call({ module: "account", action: "tokentx", address, startblock: "0", endblock: "99999999", page: "1", offset: String(limit), sort });
  }

  internalTxList(address: string, limit: number) {
    return this.call({ module: "account", action: "txlistinternal", address, startblock: "0", endblock: "99999999", page: "1", offset: String(limit), sort: "desc" });
  }
}

export function etherscanV2Client(chainId: number, apiKey: string) {
  return new EtherscanCompatibleClient("Etherscan API V2", "https://api.etherscan.io/v2/api", {
    chainid: String(chainId),
    apikey: apiKey,
  });
}

export function blockscoutClient(name: string, url: string) {
  return new EtherscanCompatibleClient(name, url);
}
