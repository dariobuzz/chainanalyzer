import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { ChainFamily, ChainKey, DataSource, SanctionMatch } from "@/types/domain";
import { addressKey, canonicalForFamily } from "@/lib/addresses";
import { CHAINS } from "@/services/blockchain/chains";
import demoIntel from "./data/demo-intelligence.json";

/**
 * Sanctions screening against the official OFAC SDN list.
 * The dataset is produced by `npm run sanctions:sync`, which downloads the
 * SDN CSV files from the U.S. Treasury and extracts "Digital Currency Address"
 * identifiers with entity name, program and SDN entry number.
 *
 * A wallet is NEVER classified as sanctioned without an exact address match.
 * Entries are indexed per chain family (EVM, Bitcoin, Tron, Solana) using the
 * listed currency and the address format; other currencies (XMR, LTC, …) are
 * kept in the dataset but not screened.
 */

export interface SanctionsDataset {
  source: string;
  sourceUrl: string;
  fetchedAt: string;
  entryCount: number;
  entries: { address: string; currency: string; entity: string; program: string; reference: string }[];
}

const DATASET_PATH = path.join(process.cwd(), "data", "sanctions", "ofac-sdn.json");

type Index = Record<ChainFamily, Map<string, SanctionMatch>>;
const emptyIndex = (): Index => ({ evm: new Map(), utxo: new Map(), tron: new Map(), solana: new Map() });

/** Chain family an OFAC entry applies to, or null when no supported chain uses it. */
function familyOf(currency: string, address: string): ChainFamily | null {
  if (canonicalForFamily("evm", address)) return "evm";
  if (canonicalForFamily("tron", address)) return "tron"; // TRX and TRC-20 stablecoins (USDT, USDC)
  if (currency === "XBT" && canonicalForFamily("utxo", address)) return "utxo";
  if (["SOL", "USDC", "USDT"].includes(currency) && canonicalForFamily("solana", address) && address.length >= 40) return "solana";
  return null;
}

let loaded: { mtime: number; data: SanctionsDataset | null; index: Index } | null = null;

function load() {
  let mtime = 0;
  try {
    mtime = fs.statSync(DATASET_PATH).mtimeMs;
  } catch {
    loaded = { mtime: 0, data: null, index: emptyIndex() };
    return loaded;
  }
  if (loaded && loaded.mtime === mtime) return loaded;
  try {
    const data = JSON.parse(fs.readFileSync(DATASET_PATH, "utf8")) as SanctionsDataset;
    const index = emptyIndex();
    for (const e of data.entries) {
      const family = familyOf(e.currency, e.address);
      if (!family) continue;
      const address = canonicalForFamily(family, e.address)!;
      index[family].set(address, {
        address,
        entity: e.entity,
        program: e.program,
        source: data.source,
        sourceUrl: data.sourceUrl,
        date: data.fetchedAt.slice(0, 10),
        reference: e.reference,
      });
    }
    loaded = { mtime, data, index };
  } catch (err) {
    console.error("[chainscope] failed to parse sanctions dataset", err);
    loaded = { mtime, data: null, index: emptyIndex() };
  }
  return loaded;
}

const demoIndex = new Map<string, SanctionMatch>(
  demoIntel.sanctions.map((s) => [addressKey(s.address), { ...s, address: addressKey(s.address), demo: true }]),
);

export class SanctionsScreener {
  constructor(private readonly includeDemo: boolean) {}

  /** True when an authoritative dataset is loaded (screening results are meaningful). */
  get available(): boolean {
    return load().data !== null;
  }

  get status() {
    const l = load();
    if (!l.data) return { loaded: false as const };
    const counts = Object.fromEntries(Object.entries(l.index).map(([f, m]) => [f, m.size])) as Record<ChainFamily, number>;
    return {
      loaded: true as const,
      source: l.data.source,
      fetchedAt: l.data.fetchedAt,
      sourceUrl: l.data.sourceUrl,
      addressesByFamily: counts,
      screenedAddresses: Object.values(counts).reduce((s, n) => s + n, 0),
    };
  }

  /** Number of listed addresses that can match on this chain. */
  addressCount(chain: ChainKey): number {
    return load().index[CHAINS[chain].family].size;
  }

  /** Exact match of a canonical address against the list for this chain's family. */
  check(chain: ChainKey, address: string): SanctionMatch | null {
    return load().index[CHAINS[chain].family].get(address) ?? (this.includeDemo ? (demoIndex.get(addressKey(address)) ?? null) : null);
  }

  /** Exact match against every family (when the chain is unknown). */
  checkAny(address: string): SanctionMatch | null {
    const key = addressKey(address);
    for (const m of Object.values(load().index)) {
      const hit = m.get(key);
      if (hit) return hit;
    }
    return this.includeDemo ? (demoIndex.get(key) ?? null) : null;
  }

  dataSources(chain: ChainKey): DataSource[] {
    const s = this.status;
    const out: DataSource[] = [];
    if (s.loaded) {
      out.push({
        name: s.source,
        kind: "sanctions",
        detail: `Exact-match screening against ${this.addressCount(chain)} ${CHAINS[chain].name}-compatible digital currency addresses listed on the OFAC SDN list.`,
        url: s.sourceUrl,
        asOf: s.fetchedAt,
      });
    }
    if (this.includeDemo) {
      out.push({ name: "ChainScope Demo Sanctions List", kind: "demo", detail: "Fictitious entries used only for demonstration." });
    }
    return out;
  }
}
