"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, ExternalLink, FilePlus2, FileText, FolderPlus, Loader2, RefreshCw } from "lucide-react";
import type { WalletAnalysis } from "@/types/domain";
import { formatDateTime, timeAgo } from "@/lib/format";
import { CHAINS, explorerAddressUrl } from "@/services/blockchain/chains";
import { Button, buttonVariants } from "@/components/ui/button";
import { Modal } from "@/components/ui/sheet";
import { Input, Label, Textarea } from "@/components/ui/input";
import { DataModeBadge, RiskBadge } from "@/components/shared";

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message ?? "Request failed");
  return json as T;
}

export function AnalysisHeader({ analysis }: { analysis: WalletAnalysis }) {
  const router = useRouter();
  const [copied, setCopied] = React.useState(false);
  const [refreshing, startRefresh] = React.useTransition();
  const [reporting, setReporting] = React.useState(false);
  const [saveOpen, setSaveOpen] = React.useState(false);
  const [ref, setRef] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [, force] = React.useReducer((x: number) => x + 1, 0);

  React.useEffect(() => {
    const id = setInterval(force, 30_000);
    return () => clearInterval(id);
  }, []);

  const chain = CHAINS[analysis.chain];
  const [reloading, setReloading] = React.useState(false);

  /** Forces a fresh analysis server-side (bypassing cache), then re-renders the page with it. */
  async function refresh() {
    setReloading(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/analysis/${analysis.chain}/${analysis.address}?refresh=1`, { cache: "no-store" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error?.message ?? "Refresh failed");
      startRefresh(() => router.refresh());
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setReloading(false);
    }
  }

  async function generateReport() {
    setReporting(true);
    try {
      const r = await postJson<{ id: string }>("/api/reports", { chain: analysis.chain, address: analysis.address });
      router.push(`/analysis/${analysis.chain}/${analysis.address}/report?id=${r.id}`);
    } catch (e) {
      setMsg((e as Error).message);
      setReporting(false);
    }
  }

  async function saveInvestigation(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await postJson("/api/investigations", { chain: analysis.chain, address: analysis.address, clientReference: ref, notes });
      setSaveOpen(false);
      setMsg("Investigation saved. Track it under Investigations.");
      setRef("");
      setNotes("");
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border-b bg-card">
      <div className="container py-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="eyebrow">Wallet Analysis</p>
              <DataModeBadge mode={analysis.dataMode} />
              <RiskBadge level={analysis.risk.riskLevel} score={analysis.risk.riskScore} />
            </div>
            <h1 className="mt-2 break-all font-mono text-[1.125rem] font-medium tracking-tight text-navy-900 md:text-[1.375rem]">{analysis.address}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.8125rem] text-muted-foreground">
              <span>
                Blockchain: <span className="font-medium text-foreground">{chain.name}</span>
              </span>
              <span>
                Analysis timestamp: <span className="font-medium text-foreground">{formatDateTime(analysis.generatedAt)}</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                <span suppressHydrationWarning>Analysis updated {timeAgo(analysis.generatedAt)}</span>
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                navigator.clipboard?.writeText(analysis.address).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                })
              }
            >
              {copied ? <Check className="text-emerald-600" /> : <Copy />} {copied ? "Copied" : "Copy Address"}
            </Button>
            {analysis.dataMode === "live" ? (
              <a href={explorerAddressUrl(analysis.chain, analysis.address)} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>
                <ExternalLink /> Open Explorer
              </a>
            ) : (
              <Button variant="outline" size="sm" disabled title="Demo wallets do not exist on-chain">
                <ExternalLink /> Open Explorer
              </Button>
            )}
            <Button variant="outline" size="sm" disabled={refreshing || reloading} onClick={refresh}>
              <RefreshCw className={refreshing || reloading ? "animate-spin" : ""} /> Refresh Analysis
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSaveOpen(true)}>
              <FolderPlus /> Save to Investigations
            </Button>
            <Button size="sm" onClick={generateReport} disabled={reporting}>
              {reporting ? <Loader2 className="animate-spin" /> : <FileText />} Generate Report
            </Button>
          </div>
        </div>
        {msg ? (
          <p className="mt-3 rounded-md border bg-muted/50 px-3 py-2 text-[0.8125rem]" role="status">
            {msg}
          </p>
        ) : null}
      </div>

      <Modal
        open={saveOpen}
        onOpenChange={setSaveOpen}
        title="Save to Investigations"
        description="Add a reference to track this review. No personal data is required."
      >
        <form onSubmit={saveInvestigation} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ref">Client / Reference</Label>
            <Input id="ref" value={ref} onChange={(e) => setRef(e.target.value)} maxLength={120} placeholder="e.g. Onboarding file 2026-114 (optional)" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Internal notes</Label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={5000} placeholder="Optional" />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setSaveOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : <FilePlus2 />} Save investigation
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
