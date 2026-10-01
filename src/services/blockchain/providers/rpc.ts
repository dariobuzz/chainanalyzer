import "server-only";
import { ProviderError, fetchJson } from "./http";

interface RpcResponse<T> {
  id: number;
  result?: T;
  error?: { code: number; message: string };
}

/** Minimal JSON-RPC client (balances, contract detection, ERC-20 balanceOf). */
export class RpcClient {
  constructor(
    public readonly name: string,
    private readonly url: string,
  ) {}

  private async single<T>(method: string, params: unknown[]): Promise<T> {
    const json = await fetchJson<RpcResponse<T>>(this.url, {
      provider: this.name,
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    if (json.error || json.result === undefined) throw new ProviderError(`${this.name}: ${json.error?.message ?? "empty result"}`, this.name);
    return json.result;
  }

  /** Batched calls with graceful fallback to sequential requests if batching is unsupported. */
  private async batch<T>(calls: { method: string; params: unknown[] }[]): Promise<(T | null)[]> {
    if (calls.length === 0) return [];
    const out: (T | null)[] = [];
    for (let i = 0; i < calls.length; i += 20) {
      const chunk = calls.slice(i, i + 20);
      try {
        const json = await fetchJson<RpcResponse<T>[]>(this.url, {
          provider: this.name,
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(chunk.map((c, j) => ({ jsonrpc: "2.0", id: j, ...c }))),
        });
        if (!Array.isArray(json)) throw new Error("batch unsupported");
        const byId = new Map(json.map((r) => [r.id, r]));
        chunk.forEach((_, j) => out.push(byId.get(j)?.result ?? null));
      } catch {
        for (const c of chunk) out.push(await this.single<T>(c.method, c.params).catch(() => null));
      }
    }
    return out;
  }

  async getBalanceWei(address: string): Promise<bigint> {
    return BigInt(await this.single<string>("eth_getBalance", [address, "latest"]));
  }

  async getContractFlags(addresses: string[]): Promise<Record<string, boolean>> {
    const res = await this.batch<string>(addresses.map((a) => ({ method: "eth_getCode", params: [a, "latest"] })));
    const flags: Record<string, boolean> = {};
    addresses.forEach((a, i) => {
      const code = res[i];
      if (typeof code === "string") flags[a] = code !== "0x" && code !== "0x0";
    });
    return flags;
  }

  async getErc20Balances(holder: string, tokens: string[]): Promise<Record<string, bigint>> {
    const data = "0x70a08231" + holder.toLowerCase().replace(/^0x/, "").padStart(64, "0");
    const res = await this.batch<string>(tokens.map((t) => ({ method: "eth_call", params: [{ to: t, data }, "latest"] })));
    const out: Record<string, bigint> = {};
    tokens.forEach((t, i) => {
      const r = res[i];
      if (typeof r === "string" && r.startsWith("0x") && r.length > 2) {
        try {
          out[t] = BigInt(r.slice(0, 66));
        } catch {
          /* ignore malformed */
        }
      }
    });
    return out;
  }
}
