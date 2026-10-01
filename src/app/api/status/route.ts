import { NextResponse } from "next/server";
import { publicConfigStatus } from "@/lib/config";
import { SanctionsScreener } from "@/services/intelligence/sanctions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Health & non-secret configuration status. */
export async function GET() {
  const cfg = publicConfigStatus();
  return NextResponse.json({ ok: true, ...cfg, sanctions: new SanctionsScreener(cfg.demoMode).status });
}
