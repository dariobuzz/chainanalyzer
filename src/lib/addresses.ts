import type { ChainFamily, ChainKey } from "@/types/domain";
import { CHAINS } from "@/services/blockchain/chains";

/**
 * Address formats per chain family (client-safe: used by the analyze form too).
 *
 * Canonical form: EVM hex and Bitcoin bech32 addresses are case-insensitive and
 * stored lowercase; base58 addresses (Bitcoin legacy, Tron, Solana) are
 * case-sensitive and kept exactly as written.
 */

const B58 = "[1-9A-HJ-NP-Za-km-z]";

const PATTERNS: Record<ChainFamily, RegExp> = {
  evm: /^0x[a-fA-F0-9]{40}$/,
  // Legacy P2PKH (1…) / P2SH (3…) base58, or bech32/bech32m (bc1…).
  utxo: new RegExp(`^(?:[13]${B58}{25,34}|bc1[02-9ac-hj-np-z]{11,71})$`),
  tron: new RegExp(`^T${B58}{33}$`),
  solana: new RegExp(`^${B58}{32,44}$`),
};

export const ADDRESS_HINT: Record<ChainFamily, string> = {
  evm: "0x followed by 40 hexadecimal characters",
  utxo: "an address starting with 1, 3 or bc1",
  tron: "T followed by 33 base58 characters",
  solana: "32–44 base58 characters (public key)",
};

export const ADDRESS_PLACEHOLDER: Record<ChainFamily, string> = {
  evm: "0x…",
  utxo: "bc1… / 1… / 3…",
  tron: "T…",
  solana: "base58 public key",
};

/** Canonical form of an address for a given family; null when the format is invalid. */
export function canonicalForFamily(family: ChainFamily, raw: string): string | null {
  const t = raw.trim();
  // bech32 is case-insensitive but must not mix cases; normalise to lowercase.
  const v = family === "evm" || (family === "utxo" && /^bc1/i.test(t)) ? t.toLowerCase() : t;
  if (family === "utxo" && /^bc1/i.test(t) && t !== t.toLowerCase() && t !== t.toUpperCase()) return null;
  return PATTERNS[family].test(v) ? v : null;
}

export function canonicalAddress(chain: ChainKey, raw: string): string | null {
  return canonicalForFamily(CHAINS[chain].family, raw);
}

export function invalidAddressMessage(chain: ChainKey): string {
  return `Invalid ${CHAINS[chain].name} address: expected ${ADDRESS_HINT[CHAINS[chain].family]}.`;
}

/**
 * Chain-independent canonical key, for data that is not tied to a chain
 * (sanctions lists, custom labels): lowercase for hex and bech32, as-is otherwise.
 */
export function addressKey(raw: string): string {
  const t = raw.trim();
  return /^0x/i.test(t) || /^bc1/i.test(t) ? t.toLowerCase() : t;
}

/**
 * Best-effort family detection from the address format (UI convenience only;
 * the selected chain is always validated explicitly).
 * Solana keys encode 32 bytes and are almost always 43–44 characters long,
 * which keeps them apart from Bitcoin legacy (≤ 35) and Tron (34) addresses.
 */
export function detectFamily(raw: string): ChainFamily | null {
  const t = raw.trim();
  if (canonicalForFamily("evm", t)) return "evm";
  if (canonicalForFamily("tron", t)) return "tron";
  if (canonicalForFamily("utxo", t)) return "utxo";
  if (canonicalForFamily("solana", t) && t.length >= 40) return "solana";
  return null;
}
