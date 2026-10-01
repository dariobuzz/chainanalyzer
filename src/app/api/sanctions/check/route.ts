import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { addressSchema } from "@/lib/validation";
import { clientKey, rateLimit } from "@/lib/security/rate-limit";
import { errorResponse, rateLimitedResponse } from "@/lib/security/errors";
import { SanctionsScreener } from "@/services/intelligence/sanctions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/sanctions/check?address=0x… → exact-match screening result with source. */
export async function GET(req: Request) {
  const rl = await rateLimit(`api:${clientKey(req)}`, config.rateLimit.apiPerMinute);
  if (!rl.ok) return rateLimitedResponse(rl);
  try {
    const address = addressSchema.parse(new URL(req.url).searchParams.get("address") ?? "");
    const screener = new SanctionsScreener(config.demoMode);
    return NextResponse.json({
      address,
      datasetLoaded: screener.available,
      dataset: screener.status,
      match: screener.check(address),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
