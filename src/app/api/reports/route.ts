import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { getStore } from "@/lib/db";
import { createReportSchema } from "@/lib/validation";
import { clientKey, rateLimit } from "@/lib/security/rate-limit";
import { errorResponse, rateLimitedResponse } from "@/lib/security/errors";
import { getWalletAnalysis } from "@/services/analysis/analyze";
import { registerReport } from "@/services/reports/reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const rl = await rateLimit(`api:${clientKey(req)}`, config.rateLimit.apiPerMinute);
  if (!rl.ok) return rateLimitedResponse(rl);
  try {
    return NextResponse.json(await getStore().listReports());
  } catch (e) {
    return errorResponse(e);
  }
}

/** Registers a new compliance report for the current analysis of a wallet. */
export async function POST(req: Request) {
  const rl = await rateLimit(`api:${clientKey(req)}`, config.rateLimit.apiPerMinute);
  if (!rl.ok) return rateLimitedResponse(rl);
  try {
    const { chain, address } = createReportSchema.parse(await req.json());
    const analysis = await getWalletAnalysis(chain, address);
    const report = await registerReport(analysis);
    return NextResponse.json(report, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
