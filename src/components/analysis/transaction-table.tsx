"use client";

import * as React from "react";
import { ArrowDownLeft, ArrowUpRight, ExternalLink, RotateCcw, Search } from "lucide-react";
import type { ChainKey, Counterparty, Transfer } from "@/types/domain";
import { ENTITY_TYPE_LABEL, NO_INTEL, RISK_CATEGORY_LABEL } from "@/lib/constants";
import { formatAmount, formatDateTime, formatNumber, formatUsd, shortAddress } from "@/lib/format";
import { explorerTxUrl } from "@/services/blockchain/chains";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Address, EntityTypeBadge } from "@/components/shared";
import { Pagination } from "./pagination";

const PAGE = 20;

function DirectionBadge({ d }: { d: Transfer["direction"] }) {
  if (d === "in")
    return (
      <span className="inline-flex items-center gap-1 text-[0.75rem] font-medium text-[#1d5fae]">
        <ArrowDownLeft className="h-3.5 w-3.5" /> In
      </span>
    );
  if (d === "out")
    return (
      <span className="inline-flex items-center gap-1 text-[0.75rem] font-medium text-[#b4501f]">
        <ArrowUpRight className="h-3.5 w-3.5" /> Out
      </span>
    );
  return <span className="text-[0.75rem] text-muted-foreground">Self</span>;
}

export function TransactionTable({
  transfers,
  counterparties,
  chain,
  totalAnalyzed,
  demo = false,
}: {
  transfers: Transfer[];
  counterparties: Counterparty[];
  chain: ChainKey;
  totalAnalyzed: number;
  demo?: boolean;
}) {
  const cpMap = React.useMemo(() => new Map(counterparties.map((c) => [c.address, c])), [counterparties]);
  const tokens = React.useMemo(() => [...new Set(transfers.map((t) => t.asset.symbol))].sort(), [transfers]);

  const [q, setQ] = React.useState("");
  const [dir, setDir] = React.useState<"all" | "in" | "out">("all");
  const [token, setToken] = React.useState("all");
  const [risk, setRisk] = React.useState<"all" | "flagged" | "clean">("all");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [minUsd, setMinUsd] = React.useState("");
  const [maxUsd, setMaxUsd] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [sel, setSel] = React.useState<Transfer | null>(null);

  const rows = React.useMemo(() => {
    const s = q.trim().toLowerCase();
    const fromTs = from ? Date.parse(`${from}T00:00:00Z`) : null;
    const toTs = to ? Date.parse(`${to}T23:59:59Z`) : null;
    const min = minUsd ? Number(minUsd) : null;
    const max = maxUsd ? Number(maxUsd) : null;
    return transfers.filter((t) => {
      if (dir !== "all" && t.direction !== dir) return false;
      if (token !== "all" && t.asset.symbol !== token) return false;
      const cp = cpMap.get(t.counterparty);
      const flagged = (cp?.riskTags.length ?? 0) > 0;
      if (risk === "flagged" && !flagged) return false;
      if (risk === "clean" && flagged) return false;
      if (fromTs !== null && t.timestamp < fromTs) return false;
      if (toTs !== null && t.timestamp > toTs) return false;
      if (min !== null && (t.usdValue ?? -1) < min) return false;
      if (max !== null && (t.usdValue ?? Infinity) > max) return false;
      if (s && !(t.hash.includes(s) || t.from.includes(s) || t.to.includes(s) || cp?.displayName.toLowerCase().includes(s))) return false;
      return true;
    });
  }, [transfers, q, dir, token, risk, from, to, minUsd, maxUsd, cpMap]);

  React.useEffect(() => setPage(1), [q, dir, token, risk, from, to, minUsd, maxUsd]);
  const pageRows = rows.slice((page - 1) * PAGE, page * PAGE);
  const reset = () => {
    setQ("");
    setDir("all");
    setToken("all");
    setRisk("all");
    setFrom("");
    setTo("");
    setMinUsd("");
    setMaxUsd("");
  };
  const selCp = sel ? cpMap.get(sel.counterparty) : undefined;

  return (
    <Card>
      <CardHeader className="border-b pb-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <CardTitle>Transaction Analysis</CardTitle>
            <CardDescription>
              {formatNumber(transfers.length)} transfers loaded from {formatNumber(totalAnalyzed)} analyzed transactions · most recent first
            </CardDescription>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search hash, address or entity" className="w-72 pl-8" />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Select value={dir} onChange={(e) => setDir(e.target.value as typeof dir)} aria-label="Direction" className="h-8 text-[0.8125rem]">
            <option value="all">All directions</option>
            <option value="in">Incoming</option>
            <option value="out">Outgoing</option>
          </Select>
          <Select value={token} onChange={(e) => setToken(e.target.value)} aria-label="Token" className="h-8 text-[0.8125rem]">
            <option value="all">All tokens</option>
            {tokens.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
          <Select value={risk} onChange={(e) => setRisk(e.target.value as typeof risk)} aria-label="Risk" className="h-8 text-[0.8125rem]">
            <option value="all">All risk</option>
            <option value="flagged">With risk indicator</option>
            <option value="clean">Without risk indicator</option>
          </Select>
          <div className="flex items-center gap-1 text-[0.75rem] text-muted-foreground">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-[140px] text-[0.8125rem]" aria-label="From date" />
            –
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-[140px] text-[0.8125rem]" aria-label="To date" />
          </div>
          <div className="flex items-center gap-1 text-[0.75rem] text-muted-foreground">
            <Input type="number" min={0} value={minUsd} onChange={(e) => setMinUsd(e.target.value)} placeholder="Min USD" className="h-8 w-[100px] text-[0.8125rem]" />
            –
            <Input type="number" min={0} value={maxUsd} onChange={(e) => setMaxUsd(e.target.value)} placeholder="Max USD" className="h-8 w-[100px] text-[0.8125rem]" />
          </div>
          <Button variant="ghost" size="sm" onClick={reset}>
            <RotateCcw /> Reset
          </Button>
        </div>
      </CardHeader>
      <Table>
        <THead>
          <TR>
            <TH>Date</TH>
            <TH>Transaction Hash</TH>
            <TH>Direction</TH>
            <TH>From</TH>
            <TH>To</TH>
            <TH>Asset</TH>
            <TH className="text-right">Amount</TH>
            <TH className="text-right">USD Value</TH>
            <TH>Counterparty</TH>
            <TH>Risk Indicator</TH>
          </TR>
        </THead>
        <TBody>
          {pageRows.map((t) => {
            const cp = cpMap.get(t.counterparty);
            return (
              <TR key={t.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSel(t)}>
                <TD className="whitespace-nowrap text-muted-foreground">{formatDateTime(t.timestamp).replace(" UTC", "")}</TD>
                <TD className="mono">{shortAddress(t.hash, 8, 6)}</TD>
                <TD>
                  <DirectionBadge d={t.direction} />
                </TD>
                <TD className="mono text-muted-foreground">{shortAddress(t.from)}</TD>
                <TD className="mono text-muted-foreground">{shortAddress(t.to)}</TD>
                <TD>
                  <span className="font-medium">{t.asset.symbol}</span>
                  {t.kind === "internal" ? <span className="ml-1 text-[0.625rem] text-muted-foreground">internal</span> : null}
                </TD>
                <TD className="text-right tabular">{formatAmount(t.amount)}</TD>
                <TD className="text-right tabular">{t.usdValue === null ? <span className="text-muted-foreground">n/a</span> : formatUsd(t.usdValue)}</TD>
                <TD className="max-w-[180px] truncate">{cp && (cp.label || cp.sanction) ? cp.displayName : <span className="text-muted-foreground">{cp?.displayName ?? "—"}</span>}</TD>
                <TD>
                  {cp?.riskTags.length ? (
                    <Badge variant="veryhigh">{RISK_CATEGORY_LABEL[cp.riskTags[0]]}</Badge>
                  ) : t.isError ? (
                    <Badge variant="outline">Failed</Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TD>
              </TR>
            );
          })}
          {pageRows.length === 0 ? (
            <TR>
              <TD colSpan={10} className="py-10 text-center text-muted-foreground">
                No transactions match the current filters.
              </TD>
            </TR>
          ) : null}
        </TBody>
      </Table>
      <Pagination page={page} total={rows.length} pageSize={PAGE} onPage={setPage} />

      <Sheet
        open={Boolean(sel)}
        onOpenChange={(o) => !o && setSel(null)}
        title="Transaction details"
        description={sel ? <span className="mono break-all">{sel.hash}</span> : null}
      >
        {sel ? (
          <div className="space-y-5 text-[0.8125rem]">
            <div className="flex items-center justify-between rounded-md border bg-muted/40 px-4 py-3">
              <DirectionBadge d={sel.direction} />
              <div className="text-right">
                <p className="text-lg font-semibold tabular">
                  {formatAmount(sel.amount)} {sel.asset.symbol}
                </p>
                <p className="text-muted-foreground">{sel.usdValue === null ? "No verified USD price" : formatUsd(sel.usdValue)}</p>
              </div>
            </div>
            <dl className="divide-y">
              {[
                ["Date", formatDateTime(sel.timestamp)],
                ["Block", formatNumber(sel.blockNumber)],
                ["Hash", <Address key="h" value={sel.hash} />],
                ["From", <Address key="f" value={sel.from} />],
                ["To", <Address key="t" value={sel.to} />],
                ["Type", sel.kind === "native" ? "Native transfer / call" : sel.kind === "token" ? "Token transfer" : "Internal transfer"],
                ["Asset", `${sel.asset.symbol}${sel.asset.name ? ` (${sel.asset.name})` : ""}`],
                ["Token contract", sel.asset.contract ? <Address key="c" value={sel.asset.contract} /> : "Native asset"],
                ["Method", sel.method ?? "—"],
                ["Status", sel.isError ? "Failed" : "Success"],
                ["Fee", sel.feeNative !== null ? `${formatAmount(sel.feeNative, 6)} native` : "—"],
              ].map(([k, v]) => (
                <div key={String(k)} className="flex items-start justify-between gap-4 py-2.5">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="text-right font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="rounded-md border p-3">
              <p className="eyebrow mb-2">Counterparty</p>
              {selCp ? (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{selCp.displayName}</span>
                    <EntityTypeBadge type={selCp.type} />
                  </div>
                  <p className="text-muted-foreground">{ENTITY_TYPE_LABEL[selCp.type]}</p>
                  {selCp.riskTags.length ? (
                    <div className="flex flex-wrap gap-1">
                      {selCp.riskTags.map((r) => (
                        <Badge key={r} variant="veryhigh">
                          {RISK_CATEGORY_LABEL[r]}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">{selCp.label ? "No risk indicators for this entity." : NO_INTEL}</p>
                  )}
                  {selCp.label ? <p className="text-[0.75rem] text-muted-foreground">Source: {selCp.label.source}</p> : null}
                </div>
              ) : (
                <p className="text-muted-foreground">—</p>
              )}
            </div>
            {demo ? (
              <p className="text-[0.75rem] text-amber-800">Demo transaction: synthetic data, not present on the blockchain.</p>
            ) : (
              <a href={explorerTxUrl(chain, sel.hash)} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>
                <ExternalLink /> View on explorer
              </a>
            )}
          </div>
        ) : null}
      </Sheet>
    </Card>
  );
}
