"use client";

import Link from "next/link";
import { ExternalLink, ScanSearch } from "lucide-react";
import type { ChainKey, Counterparty, Transfer } from "@/types/domain";
import { NO_INTEL, RISK_CATEGORY_LABEL } from "@/lib/constants";
import { formatAmount, formatDate, formatDateTime, formatNumber, formatPct, formatUsd, shortAddress } from "@/lib/format";
import { explorerAddressUrl } from "@/services/blockchain/chains";
import { Sheet } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Address, EntityTypeBadge } from "@/components/shared";

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b py-2.5 text-[0.8125rem] last:border-0">
      <span className="shrink-0 text-muted-foreground">{k}</span>
      <span className="min-w-0 text-right font-medium">{v}</span>
    </div>
  );
}

export function CounterpartyDrawer({
  cp,
  chain,
  transfers,
  open,
  onOpenChange,
}: {
  cp: Counterparty | null;
  chain: ChainKey;
  transfers: Transfer[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  if (!cp) return null;
  const recent = transfers.filter((t) => t.counterparty === cp.address).slice(0, 8);
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={cp.displayName} description={<span className="mono">{cp.address}</span>}>
      <div className="flex flex-wrap gap-2">
        <EntityTypeBadge type={cp.type} />
        {cp.isContract === true ? <Badge variant="outline">Contract</Badge> : cp.isContract === false ? <Badge variant="outline">Externally owned account</Badge> : null}
        {cp.riskTags.map((t) => (
          <Badge key={t} variant="veryhigh">{RISK_CATEGORY_LABEL[t]}</Badge>
        ))}
      </div>

      <div className="mt-5">
        <Row k="Address" v={<Address value={cp.address} />} />
        <Row k="Entity" v={cp.label?.entityName ?? cp.sanction?.entity ?? <span className="text-muted-foreground">{NO_INTEL}</span>} />
        <Row k="Received from analyzed wallet" v={formatUsd(cp.outgoingUsd)} />
        <Row k="Sent to analyzed wallet" v={formatUsd(cp.incomingUsd)} />
        <Row k="Transactions" v={`${formatNumber(cp.txCount)} (${cp.incomingCount} in · ${cp.outgoingCount} out)`} />
        <Row k="Exposure" v={formatPct(cp.exposurePct)} />
        <Row k="First / last interaction" v={`${formatDate(cp.firstInteraction)} – ${formatDate(cp.lastInteraction)}`} />
        <Row k="Assets" v={cp.assets.join(", ") || "—"} />
      </div>

      <div className="mt-5 rounded-md border bg-muted/40 p-3">
        <p className="eyebrow">Intelligence</p>
        {cp.sanction ? (
          <div className="mt-2 text-[0.8125rem]">
            <p className="font-semibold text-risk-veryhigh">Sanctions list match</p>
            <p className="mt-1">{cp.sanction.entity} — program {cp.sanction.program}</p>
            <p className="text-muted-foreground">
              {cp.sanction.source} · {cp.sanction.reference} · {cp.sanction.date}
            </p>
          </div>
        ) : null}
        {cp.label ? (
          <div className="mt-2 text-[0.8125rem]">
            <p>
              <span className="font-medium">{cp.label.entityName}</span> · confidence {Math.round(cp.label.confidence * 100)}%
            </p>
            <p className="text-muted-foreground">
              Source: {cp.label.source}
              {cp.label.reference ? ` · ${cp.label.reference}` : ""}
            </p>
            {cp.label.demo ? <Badge variant="demo" className="mt-1">Fictitious demo label</Badge> : null}
          </div>
        ) : null}
        {!cp.label && !cp.sanction ? <p className="mt-2 text-[0.8125rem] text-muted-foreground">{NO_INTEL}. No risk is attributed to this address.</p> : null}
      </div>

      {recent.length ? (
        <div className="mt-5">
          <p className="eyebrow mb-2">Recent transfers with this counterparty</p>
          <ul className="divide-y rounded-md border">
            {recent.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2 text-[0.75rem]">
                <span className="text-muted-foreground">{formatDateTime(t.timestamp)}</span>
                <span className={t.direction === "in" ? "text-[#2a78d6]" : "text-[#c2410c]"}>
                  {t.direction === "in" ? "IN" : "OUT"} {formatAmount(t.amount)} {t.asset.symbol}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-2">
        <Link href={`/analysis/${chain}/${cp.address}`} className={buttonVariants({ size: "sm" })}>
          <ScanSearch /> Analyze this counterparty
        </Link>
        <a href={explorerAddressUrl(chain, cp.address)} target="_blank" rel="noopener noreferrer" className={buttonVariants({ size: "sm", variant: "outline" })}>
          <ExternalLink /> Explorer
        </a>
      </div>
      <p className="mt-3 text-[0.6875rem] text-muted-foreground">Multi-hop expansion (2–3 hops) is planned; currently opens a dedicated analysis of {shortAddress(cp.address)}.</p>
    </Sheet>
  );
}
