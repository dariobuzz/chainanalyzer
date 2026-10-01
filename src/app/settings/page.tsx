import type { Metadata } from "next";
import { CheckCircle2, CircleDashed, XCircle } from "lucide-react";
import { publicConfigStatus } from "@/lib/config";
import { formatDateTime, formatNumber } from "@/lib/format";
import { CHAINS, PLANNED_CHAINS, SUPPORTED_CHAINS } from "@/services/blockchain/chains";
import { SanctionsScreener } from "@/services/intelligence/sanctions";
import { createEntityRegistry } from "@/services/intelligence/entities";
import { VERIFIED_RULES } from "@/services/intelligence/risk";
import { RISK_CATEGORY_LABEL } from "@/lib/constants";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Settings" };

function Row({ label, ok, value, hint }: { label: string; ok: boolean | null; value: string; hint?: string }) {
  const Icon = ok === null ? CircleDashed : ok ? CheckCircle2 : XCircle;
  return (
    <div className="flex items-start gap-3 border-b py-3 last:border-0">
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${ok === null ? "text-muted-foreground" : ok ? "text-emerald-600" : "text-amber-600"}`} />
      <div className="min-w-0 flex-1">
        <p className="text-[0.8125rem] font-medium">{label}</p>
        {hint ? <p className="text-[0.75rem] text-muted-foreground">{hint}</p> : null}
      </div>
      <p className="text-right text-[0.8125rem] text-muted-foreground">{value}</p>
    </div>
  );
}

export default function SettingsPage() {
  const cfg = publicConfigStatus();
  const sanctions = new SanctionsScreener(false).status;
  const registry = createEntityRegistry({ demo: false });
  return (
    <div>
      <PageHeader
        eyebrow="Configuration"
        title="Settings"
        description="Read-only view of the platform configuration. Values are set via environment variables (see .env.example); secrets are never displayed."
      />
      <div className="container grid gap-6 py-8 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Data mode & providers</CardTitle>
            <CardDescription>Blockchain data acquisition</CardDescription>
          </CardHeader>
          <CardContent>
            <Row label="Data mode" ok={null} value={cfg.demoMode ? "Demo (DEMO_MODE=true)" : "Live"} hint="Demo mode uses a synthetic, clearly labelled dataset." />
            <Row
              label="Etherscan API V2"
              ok={cfg.etherscanConfigured}
              value={cfg.etherscanConfigured ? "Configured" : "Not configured"}
              hint="Required for BNB Chain; optional for Ethereum and Base (Blockscout fallback)."
            />
            <Row label="Blockscout (keyless)" ok value="Ethereum, Base" />
            <Row label="JSON-RPC" ok value="Balances, token balances, contract detection" />
            <Row label="Pricing" ok={null} value={cfg.coingeckoKeyConfigured ? "CoinGecko (keyed)" : "CoinGecko public API"} />
            <Row label="Max transactions per type" ok={null} value={formatNumber(cfg.maxTransactions)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Intelligence sources</CardTitle>
            <CardDescription>Verified intelligence used by the risk engine</CardDescription>
          </CardHeader>
          <CardContent>
            <Row
              label="OFAC SDN list"
              ok={sanctions.loaded}
              value={sanctions.loaded ? `${formatNumber(sanctions.evmAddresses)} EVM addresses` : "Not loaded"}
              hint={sanctions.loaded ? `Synced ${formatDateTime(sanctions.fetchedAt)} · refresh with npm run sanctions:sync` : "Run npm run sanctions:sync"}
            />
            <Row label="ChainScope Entity Registry" ok value={`${formatNumber(registry.size)} labels`} hint={`Version ${registry.version} · ${registry.sourceName}`} />
            <div className="mt-4">
              <p className="eyebrow mb-2">Registry coverage by category</p>
              <div className="flex flex-wrap gap-1.5">
                {VERIFIED_RULES.filter((r) => r.category !== "sanctioned_address").map((r) => {
                  const n = SUPPORTED_CHAINS.reduce((s, c) => s + r.entityTypes.reduce((x, t) => x + (registry.coverage(c)[t] ?? 0), 0), 0);
                  return (
                    <Badge key={r.category} variant={n ? "default" : "outline"}>
                      {RISK_CATEGORY_LABEL[r.category]}: {n ? n : "no source"}
                    </Badge>
                  );
                })}
              </div>
              <p className="mt-2 text-[0.6875rem] text-muted-foreground">Categories without a source are reported as “Unknown / No verified intelligence available” and never add risk points.</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Storage, cache & security</CardTitle>
          </CardHeader>
          <CardContent>
            <Row label="Storage" ok={null} value={cfg.storage} hint="Set DATABASE_URL to use PostgreSQL / Supabase." />
            <Row label="Analysis cache TTL" ok={null} value={`${cfg.cacheTtlMinutes} minutes`} />
            <Row label="Rate limit – analysis" ok={null} value={`${cfg.rateLimit.analysisPerMinute} / min / IP`} />
            <Row label="Rate limit – API" ok={null} value={`${cfg.rateLimit.apiPerMinute} / min / IP`} />
            <Row label="API keys" ok value="Server-side only" hint="All provider calls run on the server; no key is exposed to the browser." />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Blockchains</CardTitle>
          </CardHeader>
          <CardContent>
            {SUPPORTED_CHAINS.map((c) => (
              <Row key={c} label={CHAINS[c].name} ok value={`EVM · chain id ${CHAINS[c].evmChainId}`} />
            ))}
            {PLANNED_CHAINS.map((c) => (
              <Row key={c.key} label={c.name} ok={null} value="Planned" hint={c.family === "evm" ? "EVM adapter reuse" : `Requires ${c.family} adapter`} />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
