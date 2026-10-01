import { z } from "zod";
import type { ChainKey } from "@/types/domain";
import { SUPPORTED_CHAINS } from "@/services/blockchain/chains";
import { canonicalAddress, invalidAddressMessage } from "@/lib/addresses";

export function isSupportedChain(v: string): v is ChainKey {
  return (SUPPORTED_CHAINS as string[]).includes(v);
}

export const chainSchema = z.enum(SUPPORTED_CHAINS as [ChainKey, ...ChainKey[]]);

/** Address formats depend on the chain, so the address is always validated together with it. */
const chainAddress = { chain: chainSchema, address: z.string().trim().min(1, "Wallet address is required").max(128) };
type ChainAddress = { chain: ChainKey; address: string };

const checkAddress = (v: ChainAddress, ctx: z.RefinementCtx) => {
  if (!canonicalAddress(v.chain, v.address)) ctx.addIssue({ code: "custom", path: ["address"], message: invalidAddressMessage(v.chain) });
};
/** Rewrites the address in canonical form (lowercase hex / bech32, base58 unchanged). */
const canonicalize = <T extends ChainAddress>(v: T): T => ({ ...v, address: canonicalAddress(v.chain, v.address)! });

/** { chain, address } with the address in canonical form for that chain. */
export const walletRefSchema = z.object(chainAddress).superRefine(checkAddress).transform(canonicalize);

export const investigationStatusSchema = z.enum(["New", "Reviewing", "Cleared", "Escalated"]);

export const createInvestigationSchema = z
  .object({
    ...chainAddress,
    clientReference: z.string().trim().max(120).default(""),
    notes: z.string().trim().max(5000).default(""),
  })
  .superRefine(checkAddress)
  .transform(canonicalize);

export const updateInvestigationSchema = z
  .object({
    clientReference: z.string().trim().max(120).optional(),
    notes: z.string().trim().max(5000).optional(),
    status: investigationStatusSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "No fields to update");

export const createReportSchema = walletRefSchema;
