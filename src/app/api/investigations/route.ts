import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { getStore } from "@/lib/db";
import { createInvestigationSchema } from "@/lib/validation";
import { clientKey, rateLimit } from "@/lib/security/rate-limit";
import { errorResponse, rateLimitedResponse } from "@/lib/security/errors";
import { getWalletAnalysis } from "@/services/analysis/analyze";
import { CHAINS } from "@/services/blockchain/chains";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const rl = await rateLimit(`api:${clientKey(req)}`, config.rateLimit.apiPerMinute);
  if (!rl.ok) return rateLimitedResponse(rl);
  try {
    return NextResponse.json(await getStore().listInvestigations());
  } catch (e) {
    return errorResponse(e);
  }
}

/** Creates an investigation. Risk score/level are taken from the server-side analysis, never from the client. */
export async function POST(req: Request) {
  const rl = await rateLimit(`api:${clientKey(req)}`, config.rateLimit.apiPerMinute);
  if (!rl.ok) return rateLimitedResponse(rl);
  try {
    const body = createInvestigationSchema.parse(await req.json());
    const analysis = await getWalletAnalysis(body.chain, body.address);
    const store = getStore();
    const inv = await store.createInvestigation({
      chain: body.chain,
      address: body.address,
      clientReference: body.clientReference,
      notes: body.notes,
      riskScore: analysis.risk.riskScore,
      riskLevel: analysis.risk.riskLevel,
      status: "New",
      dataMode: analysis.dataMode,
    });
    await store
      .logActivity({
        type: "investigation_created",
        message: `Investigation opened${inv.clientReference ? ` for "${inv.clientReference}"` : ""} (${CHAINS[inv.chain].name})`,
        chain: inv.chain,
        address: inv.address,
      })
      .catch(() => undefined);
    return NextResponse.json(inv, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
