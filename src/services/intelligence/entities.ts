import "server-only";
import type { ChainKey, EntityLabel, EntityType } from "@/types/domain";
import seed from "./data/entities.seed.json";
import demoIntel from "./data/demo-intelligence.json";

/**
 * Entity Registry.
 * Resolution order: custom labels (DB / runtime, future) → curated seed → demo labels (demo mode only).
 * Schema mirrors the `entities` table: address, chain, entityName, entityType, source, confidence, lastUpdated.
 */

interface SeedEntry {
  address: string;
  chain: string;
  entityName: string;
  entityType: string;
  confidence: number;
  reference?: string;
}

const SEED_SOURCE = seed.source;

function toLabel(e: SeedEntry, source: string, lastUpdated: string, demo = false): EntityLabel {
  return {
    address: e.address.toLowerCase(),
    chain: e.chain as EntityLabel["chain"],
    entityName: e.entityName,
    entityType: e.entityType as EntityType,
    source,
    confidence: e.confidence,
    lastUpdated,
    reference: e.reference,
    demo,
  };
}

const seedLabels: EntityLabel[] = (seed.entries as SeedEntry[]).map((e) => toLabel(e, SEED_SOURCE, seed.version));
const demoLabels: EntityLabel[] = (demoIntel.entities as SeedEntry[]).map((e) =>
  toLabel(e, "ChainScope Demo Intelligence (fictitious)", "demo", true),
);

function index(labels: EntityLabel[]) {
  const m = new Map<string, EntityLabel>();
  for (const l of labels) m.set(`${l.chain}:${l.address}`, l);
  return m;
}

const seedIndex = index(seedLabels);
const demoIndex = index(demoLabels);

export class EntityRegistry {
  constructor(
    private readonly includeDemo: boolean,
    private readonly custom: Map<string, EntityLabel> = new Map(),
  ) {}

  lookup(chain: ChainKey, address: string): EntityLabel | null {
    const a = address.toLowerCase();
    const keys = [`${chain}:${a}`, `evm:${a}`];
    for (const k of keys) {
      const hit = this.custom.get(k) ?? seedIndex.get(k) ?? (this.includeDemo ? demoIndex.get(k) : undefined);
      if (hit) return hit;
    }
    return null;
  }

  /** Number of labelled addresses per entity type for a chain (used to state coverage honestly). */
  coverage(chain: ChainKey): Partial<Record<EntityType, number>> {
    const out: Partial<Record<EntityType, number>> = {};
    const all = [...seedLabels, ...(this.includeDemo ? demoLabels : []), ...this.custom.values()];
    for (const l of all) {
      if (l.chain !== chain && l.chain !== "evm") continue;
      out[l.entityType] = (out[l.entityType] ?? 0) + 1;
    }
    return out;
  }

  get size() {
    return seedLabels.length + this.custom.size + (this.includeDemo ? demoLabels.length : 0);
  }

  get sourceName() {
    return SEED_SOURCE;
  }

  get version() {
    return seed.version;
  }
}

export function createEntityRegistry(opts: { demo: boolean; custom?: EntityLabel[] }) {
  return new EntityRegistry(opts.demo, index(opts.custom ?? []));
}
