import "server-only";

export class ProviderError extends Error {
  constructor(
    message: string,
    public provider: string,
  ) {
    super(message);
  }
}

/** fetch with timeout; never logs or returns the request URL (it may contain an API key). */
export async function fetchJson<T>(url: string, init: RequestInit & { timeoutMs?: number; provider: string }): Promise<T> {
  const { timeoutMs = 15_000, provider, ...rest } = init;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...rest, signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) throw new ProviderError(`${provider} responded with HTTP ${res.status}`, provider);
    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    const reason = (e as Error).name === "AbortError" ? "timed out" : "network error";
    throw new ProviderError(`${provider} request ${reason}`, provider);
  } finally {
    clearTimeout(timer);
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** fetchJson with backoff on rate limiting (HTTP 429) and transient 5xx errors. */
export async function fetchJsonRetry<T>(url: string, init: RequestInit & { timeoutMs?: number; provider: string }, retries = 3): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetchJson<T>(url, init);
    } catch (e) {
      if (attempt >= retries || !/HTTP (429|5dd)/.test((e as Error).message)) throw e;
      await sleep(800 * 2 ** attempt);
    }
  }
}

/** Wall-clock budget shared by the paging loops of one analysis. */
export function timeBudget(ms: number) {
  const end = Date.now() + ms;
  return {
    expired: () => Date.now() >= end,
    /** Request timeout that does not overrun the budget (with a floor so a request can still complete). */
    timeout: (floorMs = 2000) => Math.max(floorMs, end - Date.now()),
  };
}
