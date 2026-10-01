import "server-only";
import type { Asset, ChainFamily, ChainKey, Transfer } from "@/types/domain";
import type { BlockchainProvider, RawWalletData } from "@/services/blockchain/types";
import { nativeAsset } from "@/services/blockchain/normalize";
import { CHAINS } from "@/services/blockchain/chains";
import { addressKey } from "@/lib/addresses";
import { DEMO_PRICES, KNOWN_TOKENS, nativePrice } from "@/services/pricing/prices";
import seed from "@/services/intelligence/data/entities.seed.json";
import demoIntel from "@/services/intelligence/data/demo-intelligence.json";
import { findDemoWallet, type DemoProfileKey } from "./wallets";

/**
 * Demo provider: deterministic, synthetic wallet histories.
 * Output is seeded by chain + address, so the same wallet always tells the
 * same story. Every artefact built from it is flagged as "Demo Data".
 */

const DAY = 86_400_000;
const HOUR = 3_600_000;

// ── deterministic randomness ────────────────────────────────────────────────
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seedValue: number) {
  let a = seedValue;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rng = () => number;
const pick = <T,>(rng: Rng, arr: T[]): T => arr[Math.floor(rng() * arr.length)];
const skewedPick = <T,>(rng: Rng, arr: T[]): T => arr[Math.floor(Math.pow(rng(), 2.2) * arr.length)];
const hex = (rng: Rng, n: number) => Array.from({ length: n }, () => Math.floor(rng() * 16).toString(16)).join("");
const chars = (rng: Rng, alphabet: string, n: number) => Array.from({ length: n }, () => alphabet[Math.floor(rng() * alphabet.length)]).join("");
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const B32 = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

/** Synthetic address in the chain family's format (never a valid checksummed address). */
function fakeAddress(rng: Rng, family: ChainFamily): string {
  if (family === "utxo") return `bc1q${chars(rng, B32, 38)}`;
  if (family === "tron") return `T${chars(rng, B58, 33)}`;
  if (family === "solana") return chars(rng, B58, 44);
  return `0x${hex(rng, 40)}`;
}

function fakeHash(rng: Rng, family: ChainFamily): string {
  if (family === "solana") return chars(rng, B58, 88);
  return family === "evm" ? `0x${hex(rng, 64)}` : hex(rng, 64);
}
const logNormal = (rng: Rng, median: number, sigma = 0.8) => {
  const u = Math.max(1e-9, rng());
  const v = rng();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return median * Math.exp(sigma * z);
};
const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;

// ── profiles ───────────────────────────────────────────────────────────────
type EventType =
  | "cex_in"
  | "cex_in_stable"
  | "p2p_in"
  | "swap_native_to_stable"
  | "swap_stable_to_native"
  | "p2p_out"
  | "cex_out"
  | "cex_out_stable"
  | "bridge_out"
  | "bridge_in"
  | "approve"
  | "contract_call"
  | "gambling_out"
  | "gambling_in"
  | "mixer_in"
  | "sanctioned_in"
  | "scam_in"
  | "structuring_in"
  | "offshore_out";

interface Profile {
  ageDays: number;
  events: number;
  medianUsd: number;
  weights: Partial<Record<EventType, number>>;
  /** Probability that an inflow is forwarded within hours (pass-through behaviour). */
  forwardProb: number;
}

const PROFILES: Record<DemoProfileKey, Profile> = {
  low: {
    ageDays: 1180,
    events: 140,
    medianUsd: 1800,
    forwardProb: 0,
    weights: {
      cex_in: 22, cex_in_stable: 6, p2p_in: 5, swap_native_to_stable: 8, swap_stable_to_native: 4,
      p2p_out: 12, cex_out: 8, cex_out_stable: 3, bridge_out: 2, approve: 4, contract_call: 3,
    },
  },
  moderate: {
    ageDays: 410,
    events: 380,
    medianUsd: 2600,
    forwardProb: 0.15,
    weights: {
      cex_in: 10, cex_in_stable: 5, p2p_in: 10, swap_native_to_stable: 22, swap_stable_to_native: 18,
      p2p_out: 8, cex_out: 4, bridge_out: 10, bridge_in: 8, approve: 8, contract_call: 6,
      gambling_out: 2, gambling_in: 1,
    },
  },
  high: {
    ageDays: 46,
    events: 190,
    medianUsd: 4200,
    forwardProb: 0.85,
    weights: {
      p2p_in: 22, mixer_in: 9, sanctioned_in: 2, scam_in: 5, structuring_in: 6, cex_in: 3,
      bridge_out: 8, offshore_out: 10, cex_out: 6, p2p_out: 6, swap_native_to_stable: 4,
    },
  },
};

const INFLOWS: EventType[] = ["cex_in", "cex_in_stable", "p2p_in", "bridge_in", "gambling_in", "mixer_in", "sanctioned_in", "scam_in", "structuring_in"];

// ── entity pools ───────────────────────────────────────────────────────────
interface SeedEntry { address: string; chain: string; entityType: string; entityName: string }

function pools(chain: ChainKey) {
  const evm = CHAINS[chain].family === "evm";
  const entries = (seed.entries as SeedEntry[]).filter((e) => e.chain === chain);
  // Real labels exist only for EVM chains; other chains use fictitious demo labels for every pool.
  const demoEntries = (demoIntel.entities as SeedEntry[]).filter((e) => e.chain === chain || (evm && e.chain === "evm"));
  const of = (t: string) => [...entries, ...(evm ? [] : demoEntries)].filter((e) => e.entityType === t).map((e) => e.address);
  const demo = (t: string) => demoEntries.filter((e) => e.entityType === t).map((e) => e.address);
  return {
    cex: of("cex"),
    dex: of("dex"),
    bridge: of("bridge"),
    mixer: of("mixer").filter((a) => a !== "0xd90e2f925da726b50c4ed8d0fb90ad053324f31b"),
    sanctioned: demo("sanctioned"),
    scam: demo("scam"),
    gambling: demo("gambling"),
    offshore: demo("high_risk_exchange"),
  };
}

// ── generator ──────────────────────────────────────────────────────────────
export function generateDemoWallet(chain: ChainKey, address: string, now = Date.now()): RawWalletData & { profile: DemoProfileKey } {
  const subject = addressKey(address);
  const family = CHAINS[chain].family;
  const evm = family === "evm";
  const rng = mulberry32(fnv1a(`${chain}:${subject}`));
  const preset = findDemoWallet(subject);
  const profileKey: DemoProfileKey = preset?.profile ?? (rng() < 0.6 ? "low" : "moderate");
  const profile = PROFILES[profileKey];
  const P = pools(chain);
  if (P.cex.length === 0) P.cex = (seed.entries as SeedEntry[]).filter((e) => e.entityType === "cex").map((e) => e.address).slice(0, 2);
  // Anchor the timeline to the start of the current UTC day so refreshes are stable.
  const end = Math.floor(now / DAY) * DAY + 12 * HOUR;
  const start = end - profile.ageDays * DAY;

  const native = nativeAsset(chain);
  const nPrice = nativePrice(DEMO_PRICES, chain) ?? 1;
  const stables = KNOWN_TOKENS[chain].filter((k) => k.price === "usd_peg").map((k) => k.asset);
  const stable: Asset | undefined = stables[0];

  const unknownWallets = Array.from({ length: 34 }, () => fakeAddress(rng, family));
  // Bitcoin has no smart contracts.
  const unknownContracts = family === "utxo" ? [] : Array.from({ length: 6 }, () => fakeAddress(rng, family));
  const contractFlags: Record<string, boolean> = {};
  unknownWallets.forEach((a) => (contractFlags[a] = false));
  unknownContracts.forEach((a) => (contractFlags[a] = true));
  [...P.dex, ...P.bridge, ...P.mixer].forEach((a) => (contractFlags[a] = true));
  [...P.cex, ...P.sanctioned, ...P.scam, ...P.gambling, ...P.offshore].forEach((a) => (contractFlags[a] = false));
  stables.forEach((s) => (contractFlags[s.contract!] = true));

  const transfers: Transfer[] = [];
  let nativeBal = 0;
  let stableBal = 0;
  let seq = 0;

  const mk = (ts: number, hash: string, dir: "in" | "out", cp: string, asset: Asset, amount: number, kind: Transfer["kind"], method: string | null = null) => {
    transfers.push({
      id: `${hash}:${kind}:${seq++}`,
      hash,
      timestamp: ts,
      blockNumber: 18_000_000 + Math.floor((ts - start) / 12_000),
      from: dir === "in" ? cp : subject,
      to: dir === "in" ? subject : cp,
      direction: dir,
      counterparty: cp,
      asset,
      amount,
      usdValue: null,
      kind,
      method,
      isError: false,
      feeNative: dir === "out" && kind === "native" ? (evm ? round(0.0004 + rng() * 0.002, 6) : round((0.3 + rng() * 2.7) / nPrice, 8)) : null,
    });
  };
  const newHash = () => fakeHash(rng, family);
  const SWAP_METHOD = evm ? "swapExactETHForTokens" : "swap";
  const BRIDGE_METHOD = evm ? "bridgeETH" : "bridge";

  /** Maps events onto what the chain supports (no tokens or contracts on Bitcoin, empty entity pools…). */
  const adapt = (ev: EventType): EventType | null => {
    if (!stable) {
      if (ev === "cex_in_stable") return "cex_in";
      if (ev === "cex_out_stable") return "cex_out";
      if (ev === "swap_native_to_stable" || ev === "swap_stable_to_native" || ev === "approve") return null;
    }
    if (!P.dex.length && (ev === "swap_native_to_stable" || ev === "swap_stable_to_native")) return null;
    if (!unknownContracts.length && ev === "contract_call") return null;
    if (!P.bridge.length && ev === "bridge_out") return "cex_out";
    if (!P.bridge.length && ev === "bridge_in") return "cex_in";
    return ev;
  };
  const usdToNative = (usd: number) => round(usd / nPrice, 5);
  const amountUsd = (mult = 1) => Math.min(250_000, Math.max(40, logNormal(rng, profile.medianUsd * mult)));

  const total = Object.values(profile.weights).reduce((s, w) => s + (w ?? 0), 0);
  const choose = (): EventType => {
    let r = rng() * total;
    for (const [k, w] of Object.entries(profile.weights)) {
      r -= w ?? 0;
      if (r <= 0) return k as EventType;
    }
    return "p2p_in";
  };

  const forward = (ts: number, usd: number) => {
    const fts = ts + (0.5 + rng() * 7) * HOUR;
    if (fts >= end) return;
    const dest = rng() < 0.45 ? pick(rng, P.offshore.length ? P.offshore : P.cex) : rng() < 0.6 ? pick(rng, P.bridge.length ? P.bridge : P.cex) : pick(rng, P.cex);
    const amt = Math.min(nativeBal * 0.97, usdToNative(usd * (0.86 + rng() * 0.12)));
    if (amt <= 0) return;
    nativeBal -= amt;
    mk(fts, newHash(), "out", dest, native, round(amt, 5), "native", P.bridge.includes(dest) ? BRIDGE_METHOD : null);
  };

  const meanGap = (profile.ageDays * DAY) / profile.events;
  let t = start + rng() * DAY;
  let first = true;

  while (t < end) {
    const chosen = adapt(first ? (profileKey === "high" ? "p2p_in" : "cex_in") : choose());
    first = false;
    if (!chosen) {
      t += -Math.log(Math.max(1e-6, rng())) * meanGap;
      continue;
    }
    let ev: EventType = chosen;
    const isInflow = INFLOWS.includes(ev);
    // Keep balances coherent: if funds are insufficient for an outflow, fund the wallet instead.
    if (!isInflow && nativeBal * nPrice < 150 && !(ev === "swap_stable_to_native" || ev === "cex_out_stable") && ev !== "approve") {
      ev = profileKey === "high" ? "p2p_in" : "cex_in";
    }
    if ((ev === "swap_stable_to_native" || ev === "cex_out_stable") && stableBal < 100) ev = "swap_native_to_stable";
    if ((ev === "mixer_in" && P.mixer.length === 0) || (ev === "gambling_out" && nativeBal * nPrice < 300)) ev = "p2p_in";

    const h = newHash();
    let usd = amountUsd();
    switch (ev) {
      case "cex_in":
        usd = amountUsd(1.3);
        nativeBal += usdToNative(usd);
        mk(t, h, "in", skewedPick(rng, P.cex), native, usdToNative(usd), "native");
        break;
      case "cex_in_stable":
        usd = round(amountUsd(1.2), 2);
        stableBal += usd;
        mk(t, h, "in", skewedPick(rng, P.cex), stable!, usd, "token");
        break;
      case "p2p_in":
        usd = profileKey === "high" ? amountUsd(0.7) : amountUsd(0.6);
        nativeBal += usdToNative(usd);
        mk(t, h, "in", skewedPick(rng, unknownWallets), native, usdToNative(usd), "native");
        break;
      case "bridge_in":
        nativeBal += usdToNative(usd);
        mk(t, h, "in", pick(rng, P.bridge), native, usdToNative(usd), "internal");
        break;
      case "swap_native_to_stable": {
        const amt = Math.min(nativeBal * 0.6, usdToNative(usd));
        if (amt <= 0) break;
        const router = skewedPick(rng, P.dex);
        nativeBal -= amt;
        const out = round(amt * nPrice * (0.993 + rng() * 0.004), 2);
        stableBal += out;
        mk(t, h, "out", router, native, round(amt, 5), "native", SWAP_METHOD);
        mk(t, h, "in", router, stable!, out, "token");
        break;
      }
      case "swap_stable_to_native": {
        const amtUsd = round(Math.min(stableBal * 0.8, usd), 2);
        if (amtUsd <= 0) break;
        const router = skewedPick(rng, P.dex);
        stableBal -= amtUsd;
        const back = usdToNative(amtUsd * (0.993 + rng() * 0.004));
        nativeBal += back;
        mk(t, h, "out", router, stable!, amtUsd, "token");
        mk(t, h, "in", router, native, back, "internal");
        break;
      }
      case "p2p_out": {
        const amt = Math.min(nativeBal * 0.5, usdToNative(usd * 0.6));
        nativeBal -= amt;
        mk(t, h, "out", skewedPick(rng, unknownWallets), native, round(amt, 5), "native");
        break;
      }
      case "cex_out": {
        const amt = Math.min(nativeBal * 0.7, usdToNative(usd));
        nativeBal -= amt;
        mk(t, h, "out", skewedPick(rng, P.cex), native, round(amt, 5), "native");
        break;
      }
      case "cex_out_stable": {
        const amtUsd = round(stableBal * (0.4 + rng() * 0.5), 2);
        stableBal -= amtUsd;
        mk(t, h, "out", skewedPick(rng, P.cex), stable!, amtUsd, "token");
        break;
      }
      case "bridge_out": {
        const amt = Math.min(nativeBal * 0.6, usdToNative(usd));
        nativeBal -= amt;
        mk(t, h, "out", pick(rng, P.bridge), native, round(amt, 5), "native", BRIDGE_METHOD);
        break;
      }
      case "approve":
        if (stables.length) mk(t, h, "out", pick(rng, stables).contract!, native, 0, "native", "approve");
        break;
      case "contract_call": {
        const amt = Math.min(nativeBal * 0.2, usdToNative(80 + rng() * 400));
        nativeBal -= amt;
        mk(t, h, "out", pick(rng, unknownContracts), native, round(amt, 5), "native", pick(rng, ["mint", "deposit", "stake", "claim"]));
        break;
      }
      case "gambling_out": {
        const amt = Math.min(nativeBal * 0.3, usdToNative(usd * 0.3));
        nativeBal -= amt;
        mk(t, h, "out", pick(rng, P.gambling), native, round(amt, 5), "native");
        break;
      }
      case "gambling_in":
        usd = amountUsd(0.25);
        nativeBal += usdToNative(usd);
        mk(t, h, "in", pick(rng, P.gambling), native, usdToNative(usd), "native");
        break;
      case "mixer_in": {
        const pool = pick(rng, P.mixer);
        const denom = pool === "0x47ce0c6ed5b0ce3d3a51fdb1c52dc66a7c3c2936" ? 1 : pool === "0x910cbd523d972eb0a6f4cae4618ad62622b39dbf" ? 10 : pool === "0xa160cdab225685da1d56aa342ad8841c3b53f291" ? 100 : 0.1;
        // keep demo values plausible; non-EVM demo pools have no fixed denominations
        const amt = evm ? (denom >= 100 ? 10 : denom) : usdToNative(amountUsd(0.8));
        nativeBal += amt;
        usd = amt * nPrice;
        mk(t, h, "in", pool, native, amt, "internal");
        break;
      }
      case "sanctioned_in":
        usd = amountUsd(0.8);
        nativeBal += usdToNative(usd);
        mk(t, h, "in", pick(rng, P.sanctioned), native, usdToNative(usd), "native");
        break;
      case "scam_in":
        usd = round(amountUsd(0.9), 2);
        if (stable) {
          stableBal += usd;
          mk(t, h, "in", pick(rng, P.scam), stable, usd, "token");
        } else {
          nativeBal += usdToNative(usd);
          mk(t, h, "in", pick(rng, P.scam), native, usdToNative(usd), "native");
        }
        break;
      case "structuring_in":
        usd = round(9_200 + rng() * 750, 2);
        if (stable) {
          stableBal += usd;
          mk(t, h, "in", skewedPick(rng, unknownWallets), stable, usd, "token");
        } else {
          nativeBal += usdToNative(usd);
          mk(t, h, "in", skewedPick(rng, unknownWallets), native, usdToNative(usd), "native");
        }
        break;
      case "offshore_out": {
        if (stableBal > 500 && rng() < 0.5) {
          const amtUsd = round(stableBal * (0.85 + rng() * 0.12), 2);
          stableBal -= amtUsd;
          mk(t, h, "out", pick(rng, P.offshore), stable!, amtUsd, "token");
        } else {
          const amt = Math.min(nativeBal * 0.9, usdToNative(usd));
          nativeBal -= amt;
          mk(t, h, "out", pick(rng, P.offshore), native, round(amt, 5), "native");
        }
        break;
      }
    }
    const stableInflow = Boolean(stable) && (ev === "cex_in_stable" || ev === "scam_in" || ev === "structuring_in");
    if (isInflow && !stableInflow && rng() < profile.forwardProb) forward(t, usd);
    if (stable && isInflow && (ev === "scam_in" || ev === "structuring_in") && rng() < profile.forwardProb && stableBal > 100) {
      const amtUsd = round(stableBal * (0.88 + rng() * 0.1), 2);
      stableBal -= amtUsd;
      mk(t + (1 + rng() * 5) * HOUR, newHash(), "out", pick(rng, P.offshore.length ? P.offshore : P.cex), stable, amtUsd, "token");
    }
    t += -Math.log(Math.max(1e-6, rng())) * meanGap;
  }

  const valid = transfers.filter((x) => x.timestamp <= end).sort((a, b) => b.timestamp - a.timestamp);
  const hashes = new Set(valid.map((x) => x.hash));
  return {
    chain,
    address: subject,
    profile: profileKey,
    nativeBalance: round(Math.max(0, nativeBal), 5),
    tokenBalances: stable && stableBal > 1 ? [{ asset: stable, balance: round(stableBal, 2) }] : [],
    transfers: valid,
    totalTransactions: { value: hashes.size, isLowerBound: false },
    firstActivity: valid.length ? valid[valid.length - 1].timestamp : null,
    lastActivity: valid.length ? valid[0].timestamp : null,
    contractFlags,
    subjectIsContract: false,
    truncated: false,
    sources: [
      {
        name: "ChainScope Demo Dataset",
        kind: "demo",
        detail: "Synthetic, deterministic transactions generated for demonstration purposes. NOT real blockchain data.",
      },
    ],
    warnings: [],
  };
}

export class DemoProvider implements BlockchainProvider {
  readonly id: string;
  constructor(readonly chain: ChainKey) {
    this.id = `demo:${chain}`;
  }
  // Demo data ignores provider fetch limits (FetchOptions).
  async fetchWalletData(address: string): Promise<RawWalletData> {
    // Simulate a short network round-trip so the loading experience is realistic.
    await new Promise((r) => setTimeout(r, 650));
    return generateDemoWallet(this.chain, address);
  }
}
