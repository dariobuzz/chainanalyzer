import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { addressSchema, chainSchema } from "@/lib/validation";
import { clientKey, rateLimit } from "@/lib/security/rate-limit";
import { errorResponse, rateLimitedResponse } from "@/lib/security/errors";
import { getWalletAnalysis } from "@/services/analysis/analyze";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/analysis/:chain/:address[?refresh=1] → WalletAnalysis */
export async function GET(req: Request, ctx: { params: Promise<{ chain: string; address: string }> }) {
  const rl = await rateLimit(`analysis:${clientKey(req)}`, config.rateLimit.analysisPerMinute);
  if (!rl.ok) return rateLimitedResponse(rl);
  try {
    const p = await ctx.params;
    const chain = chainSchema.parse(p.chain);
    const address = addressSchema.parse(p.address);
    const refresh = new URL(req.url).searchParams.get("refresh") === "1";
    const analysis = await getWalletAnalysis(chain, address, { refresh });
    return NextResponse.json(analysis, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
