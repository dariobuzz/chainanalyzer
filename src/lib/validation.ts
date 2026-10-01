import { z } from "zod";
import type { ChainKey } from "@/types/domain";
import { SUPPORTED_CHAINS } from "@/services/blockchain/chains";

const EVM_ADDRESS = /^0x[a-fA-F0-9]{40}$/;

export function isSupportedChain(v: string): v is ChainKey {
  return (SUPPORTED_CHAINS as string[]).includes(v);
}

export function isEvmAddress(v: string): boolean {
  return EVM_ADDRESS.test(v.trim());
}

/** Normalizes an EVM address to lowercase. Returns null when invalid. */
export function normalizeAddress(v: string): string | null {
  const t = v.trim();
  return isEvmAddress(t) ? t.toLowerCase() : null;
}

export const chainSchema = z.enum(SUPPORTED_CHAINS as [ChainKey, ...ChainKey[]]);
export const addressSchema = z
  .string()
  .trim()
  .regex(EVM_ADDRESS, "Invalid wallet address: expected 0x followed by 40 hexadecimal characters")
  .transform((s) => s.toLowerCase());

export const investigationStatusSchema = z.enum(["New", "Reviewing", "Cleared", "Escalated"]);

export const createInvestigationSchema = z.object({
  chain: chainSchema,
  address: addressSchema,
  clientReference: z.string().trim().max(120).default(""),
  notes: z.string().trim().max(5000).default(""),
});

export const updateInvestigationSchema = z
  .object({
    clientReference: z.string().trim().max(120).optional(),
    notes: z.string().trim().max(5000).optional(),
    status: investigationStatusSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "No fields to update");

export const createReportSchema = z.object({ chain: chainSchema, address: addressSchema });
