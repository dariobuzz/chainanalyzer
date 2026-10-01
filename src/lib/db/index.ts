import "server-only";
import { config } from "@/lib/config";
import { FileStore } from "./file-store";
import { PostgresStore } from "./postgres-store";
import type { Store } from "./types";

const g = globalThis as unknown as { __csStore?: Store };

/** Singleton store: PostgreSQL when DATABASE_URL is set, otherwise local JSON files. */
export function getStore(): Store {
  if (!g.__csStore) {
    g.__csStore = config.databaseUrl ? new PostgresStore(config.databaseUrl, config.databaseSsl) : new FileStore();
  }
  return g.__csStore;
}

export type { Store, WalletRecord, DashboardStats } from "./types";
