import { NextResponse } from "next/server";
import { z } from "zod";
import { config } from "@/lib/config";
import { getStore } from "@/lib/db";
import { updateInvestigationSchema } from "@/lib/validation";
import { clientKey, rateLimit } from "@/lib/security/rate-limit";
import { PublicError, errorResponse, rateLimitedResponse } from "@/lib/security/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const idSchema = z.string().uuid("Invalid investigation id");

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const rl = await rateLimit(`api:${clientKey(req)}`, config.rateLimit.apiPerMinute);
  if (!rl.ok) return rateLimitedResponse(rl);
  try {
    const id = idSchema.parse((await ctx.params).id);
    const patch = updateInvestigationSchema.parse(await req.json());
    const store = getStore();
    const updated = await store.updateInvestigation(id, patch);
    if (!updated) throw new PublicError("Investigation not found", 404, "not_found");
    if (patch.status) {
      await store
        .logActivity({ type: "investigation_updated", message: `Investigation status set to ${patch.status}`, chain: updated.chain, address: updated.address })
        .catch(() => undefined);
    }
    return NextResponse.json(updated);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const rl = await rateLimit(`api:${clientKey(req)}`, config.rateLimit.apiPerMinute);
  if (!rl.ok) return rateLimitedResponse(rl);
  try {
    const id = idSchema.parse((await ctx.params).id);
    const ok = await getStore().deleteInvestigation(id);
    if (!ok) throw new PublicError("Investigation not found", 404, "not_found");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
