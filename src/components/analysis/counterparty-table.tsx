"use client";

import * as React from "react";
import { Search } from "lucide-react";
import type { ChainKey, Counterparty, EntityType, Transfer } from "@/types/domain";
import { ENTITY_TYPE_LABEL, RISK_CATEGORY_LABEL } from "@/lib/constants";
import { formatDate, formatNumber, formatPct, formatUsd, shortAddress } from "@/lib/format";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EntityTypeBadge } from "@/components/shared";
import { Pagination } from "./pagination";
import { CounterpartyDrawer } from "./counterparty-drawer";

const PAGE = 15;

export function CounterpartyTable({ counterparties, transfers, chain }: { counterparties: Counterparty[]; transfers: Transfer[]; chain: ChainKey }) {
  const [q, setQ] = React.useState("");
  const [type, setType] = React.useState<"all" | EntityType>("all");
  const [page, setPage] = React.useState(1);
  const [sel, setSel] = React.useState<Counterparty | null>(null);

  const types = React.useMemo(() => [...new Set(counterparties.map((c) => c.type))], [counterparties]);
  const rows = React.useMemo(() => {
    const s = q.trim().toLowerCase();
    return counterparties.filter(
      (c) => (type === "all" || c.type === type) && (!s || c.address.includes(s) || c.displayName.toLowerCase().includes(s)),
    );
  }, [counterparties, q, type]);
  React.useEffect(() => setPage(1), [q, type]);
  const pageRows = rows.slice((page - 1) * PAGE, page * PAGE);

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-end justify-between gap-3 border-b pb-4">
        <div>
          <CardTitle>Counterparty Analysis</CardTitle>
          <CardDescription>{formatNumber(counterparties.length)} counterparties · sorted by value exchanged · click a row for details</CardDescription>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search entity or address" className="w-56 pl-8" />
          </div>
          <Select value={type} onChange={(e) => setType(e.target.value as typeof type)} aria-label="Filter by type">
            <option value="all">All types</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {ENTITY_TYPE_LABEL[t]}
              </option>
            ))}
          </Select>
        </div>
      </CardHeader>
      <Table>
        <THead>
          <TR>
            <TH>Entity / Address</TH>
            <TH>Type</TH>
            <TH className="text-right">Incoming</TH>
            <TH className="text-right">Outgoing</TH>
            <TH className="text-right">Transactions</TH>
            <TH className="text-right">Exposure</TH>
            <TH>Risk</TH>
            <TH>Last Interaction</TH>
          </TR>
        </THead>
        <TBody>
          {pageRows.map((c) => (
            <TR key={c.address} className="cursor-pointer hover:bg-muted/50" onClick={() => setSel(c)}>
              <TD>
                <p className="font-medium">{c.label || c.sanction ? c.displayName : <span className="text-muted-foreground">{c.displayName}</span>}</p>
                <p className="mono text-[0.6875rem] text-muted-foreground">{shortAddress(c.address, 10, 8)}</p>
              </TD>
              <TD>
                <EntityTypeBadge type={c.type} />
              </TD>
              <TD className="text-right tabular">{c.incomingUsd ? formatUsd(c.incomingUsd) : "—"}</TD>
              <TD className="text-right tabular">{c.outgoingUsd ? formatUsd(c.outgoingUsd) : "—"}</TD>
              <TD className="text-right tabular">{formatNumber(c.txCount)}</TD>
              <TD className="text-right tabular">
                <div className="flex items-center justify-end gap-2">
                  <div className="h-1.5 w-12 rounded-full bg-muted">
                    <div className="h-1.5 rounded-full bg-navy-500" style={{ width: `${Math.min(100, c.exposurePct)}%` }} />
                  </div>
                  {formatPct(c.exposurePct)}
                </div>
              </TD>
              <TD>
                {c.riskTags.length ? (
                  <div className="flex flex-wrap gap-1">
                    {c.riskTags.map((t) => (
                      <Badge key={t} variant="veryhigh">
                        {RISK_CATEGORY_LABEL[t]}
                      </Badge>
                    ))}
                  </div>
                ) : c.label ? (
                  <span className="text-[0.75rem] text-muted-foreground">None identified</span>
                ) : (
                  <span className="text-[0.75rem] text-muted-foreground">Unknown</span>
                )}
              </TD>
              <TD className="whitespace-nowrap text-muted-foreground">{formatDate(c.lastInteraction)}</TD>
            </TR>
          ))}
          {pageRows.length === 0 ? (
            <TR>
              <TD colSpan={8} className="py-10 text-center text-muted-foreground">
                No counterparties match the current filters.
              </TD>
            </TR>
          ) : null}
        </TBody>
      </Table>
      <Pagination page={page} total={rows.length} pageSize={PAGE} onPage={setPage} />
      <CounterpartyDrawer cp={sel} chain={chain} transfers={transfers} open={Boolean(sel)} onOpenChange={(o) => !o && setSel(null)} />
    </Card>
  );
}
