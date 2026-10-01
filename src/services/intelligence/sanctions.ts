import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { DataSource, SanctionMatch } from "@/types/domain";
import demoIntel from "./data/demo-intelligence.json";

/**
 * Sanctions screening against the official OFAC SDN list.
 * The dataset is produced by `npm run sanctions:sync`, which downloads the
 * SDN CSV files from the U.S. Treasury and extracts "Digital Currency Address"
 * identifiers with entity name, program and SDN entry number.
 *
 * A wallet is NEVER classified as sanctioned without an exact address match.
 */

export interface SanctionsDataset {
  source: string;
  sourceUrl: string;
  fetchedAt: string;
  entryCount: number;
  entries: { address: string; currency: string; entity: string; program: string; reference: string }[];
}

const DATASET_PATH = path.join(process.cwd(), "data", "sanctions", "ofac-sdn.json");

let loaded: { mtime: number; data: SanctionsDataset | null; index: Map<string, SanctionMatch> } | null = null;

function load() {
  let mtime = 0;
  try {
    mtime = fs.statSync(DATASET_PATH).mtimeMs;
  } catch {
    loaded = { mtime: 0, data: null, index: new Map() };
    return loaded;
  }
  if (loaded && loaded.mtime === mtime) return loaded;
  try {
    const data = JSON.parse(fs.readFileSync(DATASET_PATH, "utf8")) as SanctionsDataset;
    const index = new Map<string, SanctionMatch>();
    for (const e of data.entries) {
      if (!/^0x[a-fA-F0-9]{40}$/.test(e.address)) continue; // EVM addresses only
      index.set(e.address.toLowerCase(), {
        address: e.address.toLowerCase(),
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
    loaded = { mtime, data: null, index: new Map() };
  }
  return loaded;
}

const demoIndex = new Map<string, SanctionMatch>(
  demoIntel.sanctions.map((s) => [s.address.toLowerCase(), { ...s, address: s.address.toLowerCase(), demo: true }]),
);

export class SanctionsScreener {
  constructor(private readonly includeDemo: boolean) {}

  /** True when an authoritative dataset is loaded (screening results are meaningful). */
  get available(): boolean {
    return load().data !== null;
  }

  get status() {
    const l = load();
    return l.data
      ? { loaded: true as const, source: l.data.source, fetchedAt: l.data.fetchedAt, evmAddresses: l.index.size, sourceUrl: l.data.sourceUrl }
      : { loaded: false as const };
  }

  check(address: string): SanctionMatch | null {
    const a = address.toLowerCase();
    return load().index.get(a) ?? (this.includeDemo ? (demoIndex.get(a) ?? null) : null);
  }

  dataSources(): DataSource[] {
    const s = this.status;
    const out: DataSource[] = [];
    if (s.loaded) {
      out.push({
        name: s.source,
        kind: "sanctions",
        detail: `Exact-match screening against ${s.evmAddresses} EVM digital currency addresses listed on the OFAC SDN list.`,
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
