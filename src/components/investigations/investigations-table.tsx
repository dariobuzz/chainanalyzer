"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Search, Trash2 } from "lucide-react";
import type { Investigation, InvestigationStatus } from "@/types/domain";
import { formatDateTime, shortAddress } from "@/lib/format";
import { CHAINS } from "@/services/blockchain/chains";
import { Card } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Sheet } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { RiskBadge } from "@/components/shared";

const STATUSES: InvestigationStatus[] = ["New", "Reviewing", "Cleared", "Escalated"];
const STATUS_STYLE: Record<InvestigationStatus, string> = {
  New: "border-sky-200 bg-sky-50 text-sky-800",
  Reviewing: "border-amber-200 bg-amber-50 text-amber-800",
  Cleared: "border-emerald-200 bg-emerald-50 text-emerald-800",
  Escalated: "border-red-200 bg-red-50 text-red-800",
};

async function patch(id: string, body: Partial<Investigation>) {
  const res = await fetch(`/api/investigations/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message ?? "Update failed");
  return json as Investigation;
}

export function InvestigationsTable({ initial }: { initial: Investigation[] }) {
  const router = useRouter();
  const [items, setItems] = React.useState(initial);
  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState<"all" | InvestigationStatus>("all");
  const [edit, setEdit] = React.useState<Investigation | null>(null);
  const [ref, setRef] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => setItems(initial), [initial]);

  const rows = items.filter((i) => {
    const s = q.trim().toLowerCase();
    return (status === "all" || i.status === status) && (!s || i.address.toLowerCase().includes(s) || i.clientReference.toLowerCase().includes(s));
  });

  async function setItemStatus(i: Investigation, s: InvestigationStatus) {
    setErr(null);
    try {
      const u = await patch(i.id, { status: s });
      setItems((xs) => xs.map((x) => (x.id === u.id ? u : x)));
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function save() {
    if (!edit) return;
    setBusy(true);
    try {
      const u = await patch(edit.id, { clientReference: ref, notes });
      setItems((xs) => xs.map((x) => (x.id === u.id ? u : x)));
      setEdit(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(i: Investigation) {
    if (!confirm("Delete this investigation? This cannot be undone.")) return;
    const res = await fetch(`/api/investigations/${i.id}`, { method: "DELETE" });
    if (res.ok) {
      setItems((xs) => xs.filter((x) => x.id !== i.id));
      setEdit(null);
      router.refresh();
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
        <div className="flex flex-wrap gap-1.5">
          {(["all", ...STATUSES] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`rounded-md px-2.5 py-1 text-[0.75rem] font-medium ${status === s ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
            >
              {s === "all" ? "All" : s} <span className="opacity-70">({s === "all" ? items.length : items.filter((i) => i.status === s).length})</span>
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search reference or wallet" className="w-64 pl-8" />
        </div>
      </div>
      {err ? <p className="border-b bg-red-50 px-5 py-2 text-[0.8125rem] text-red-800">{err}</p> : null}
      <Table>
        <THead>
          <TR>
            <TH>Date</TH>
            <TH>Client / Reference</TH>
            <TH>Wallet</TH>
            <TH>Blockchain</TH>
            <TH>Risk Score</TH>
            <TH>Risk Level</TH>
            <TH>Status</TH>
            <TH className="text-right">Actions</TH>
          </TR>
        </THead>
        <TBody>
          {rows.map((i) => (
            <TR key={i.id} className="hover:bg-muted/40">
              <TD className="whitespace-nowrap text-muted-foreground">{formatDateTime(i.createdAt).replace(" UTC", "")}</TD>
              <TD>
                <p className="font-medium">{i.clientReference || <span className="text-muted-foreground">—</span>}</p>
                {i.notes ? <p className="max-w-[240px] truncate text-[0.6875rem] text-muted-foreground">{i.notes}</p> : null}
              </TD>
              <TD>
                <Link href={`/analysis/${i.chain}/${i.address}`} className="mono text-accent hover:underline">
                  {shortAddress(i.address, 8, 6)}
                </Link>
                {i.dataMode === "demo" ? <Badge variant="demo" className="ml-2">Demo</Badge> : null}
              </TD>
              <TD>{CHAINS[i.chain].name}</TD>
              <TD className="mono font-semibold">{i.riskScore}</TD>
              <TD>
                <RiskBadge level={i.riskLevel} />
              </TD>
              <TD>
                <select
                  value={i.status}
                  onChange={(e) => setItemStatus(i, e.target.value as InvestigationStatus)}
                  className={`rounded-md border px-2 py-1 text-[0.75rem] font-medium outline-none ${STATUS_STYLE[i.status]}`}
                  aria-label="Status"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </TD>
              <TD className="text-right">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Edit"
                  onClick={() => {
                    setEdit(i);
                    setRef(i.clientReference);
                    setNotes(i.notes);
                  }}
                >
                  <Pencil />
                </Button>
              </TD>
            </TR>
          ))}
          {rows.length === 0 ? (
            <TR>
              <TD colSpan={8} className="py-14 text-center text-muted-foreground">
                {items.length === 0 ? "No investigations yet. Analyze a wallet and use “Save to Investigations”." : "No investigations match the filters."}
              </TD>
            </TR>
          ) : null}
        </TBody>
      </Table>

      <Sheet open={Boolean(edit)} onOpenChange={(o) => !o && setEdit(null)} title="Investigation" description={edit ? <span className="mono">{edit.address}</span> : null}>
        {edit ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <RiskBadge level={edit.riskLevel} score={edit.riskScore} />
              <span className="text-[0.75rem] text-muted-foreground">at time of creation · {CHAINS[edit.chain].name}</span>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="eref">Client / Reference</Label>
              <Input id="eref" value={ref} onChange={(e) => setRef(e.target.value)} maxLength={120} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="enotes">Internal notes</Label>
              <Textarea id="enotes" rows={8} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={5000} />
            </div>
            <p className="text-[0.6875rem] text-muted-foreground">Avoid entering personal data unless required by your procedures.</p>
            <div className="flex justify-between gap-2">
              <Button variant="ghost" className="text-red-700 hover:bg-red-50" onClick={() => remove(edit)}>
                <Trash2 /> Delete
              </Button>
              <div className="flex gap-2">
                <Link href={`/analysis/${edit.chain}/${edit.address}`} className="inline-flex h-9 items-center rounded-md border px-4 text-sm hover:bg-muted">
                  Open analysis
                </Link>
                <Button onClick={save} disabled={busy}>
                  {busy ? <Loader2 className="animate-spin" /> : null} Save
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </Sheet>
    </Card>
  );
}
