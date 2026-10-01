import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { addressKey } from "@/lib/addresses";
import { chainSchema, walletRefSchema } from "@/lib/validation";
import { clientKey, rateLimit } from "@/lib/security/rate-limit";
import { PublicError, errorResponse, rateLimitedResponse } from "@/lib/security/errors";
import { SanctionsScreener } from "@/services/intelligence/sanctions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/sanctions/check?address=…[&chain=…] → exact-match screening result with source.
 * Without `chain`, the address is screened against every chain's list.
 */
export async function GET(req: Request) {
  const rl = await rateLimit(`api:${clientKey(req)}`, config.rateLimit.apiPerMinute);
  if (!rl.ok) return rateLimitedResponse(rl);
  try {
    const params = new URL(req.url).searchParams;
    const rawAddress = (params.get("address") ?? "").trim();
    const rawChain = params.get("chain");
    const screener = new SanctionsScreener(config.demoMode);
    if (rawChain) {
      const { chain, address } = walletRefSchema.parse({ chain: chainSchema.parse(rawChain), address: rawAddress });
      return NextResponse.json({ address, chain, datasetLoaded: screener.available, dataset: screener.status, match: screener.check(chain, address) });
    }
    if (!rawAddress || rawAddress.length > 128) throw new PublicError("Invalid wallet address.", 400, "invalid_address");
    const address = addressKey(rawAddress);
    return NextResponse.json({ address, datasetLoaded: screener.available, dataset: screener.status, match: screener.checkAny(address) });
  } catch (e) {
    return errorResponse(e);
  }
}
