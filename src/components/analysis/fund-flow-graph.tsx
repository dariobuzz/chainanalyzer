"use client";

import * as React from "react";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { AlertTriangle, ArrowLeftRight, Boxes, Building2, CircleDot, Coins, FileCode2, Layers, Shuffle, Wallet } from "lucide-react";
import type { ChainKey, Counterparty, FlowGraph, FlowGraphNode, Transfer } from "@/types/domain";
import { ENTITY_TYPE_LABEL } from "@/lib/constants";
import { formatUsd, shortAddress } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CounterpartyDrawer } from "./counterparty-drawer";

const IN = "#2a78d6";
const OUT = "#eb6834";
const RISK = "#b91c1c";

type FlowNodeData = { node: FlowGraphNode; side: "left" | "right" | "center" };

function kindIcon(kind: FlowGraphNode["kind"]) {
  switch (kind) {
    case "subject":
      return Wallet;
    case "cex":
      return Building2;
    case "dex":
      return ArrowLeftRight;
    case "bridge":
      return Layers;
    case "token_contract":
      return Coins;
    case "smart_contract":
      return FileCode2;
    case "mixer":
      return Shuffle;
    case "other":
      return Boxes;
    case "unknown_wallet":
      return CircleDot;
    default:
      return AlertTriangle;
  }
}

function kindLabel(kind: FlowGraphNode["kind"]) {
  if (kind === "subject") return "Analyzed wallet";
  if (kind === "other") return "Aggregated";
  return ENTITY_TYPE_LABEL[kind];
}

const handleStyle = { opacity: 0, width: 6, height: 6, border: 0 };

function SubjectNode({ data }: NodeProps<Node<FlowNodeData>>) {
  const n = data.node;
  return (
    <div className="w-[190px] rounded-xl border-2 border-navy-900 bg-navy-900 px-4 py-3 text-white shadow-lg">
      <Handle id="tl" type="target" position={Position.Left} style={{ ...handleStyle, top: "38%" }} />
      <Handle id="sl" type="source" position={Position.Left} style={{ ...handleStyle, top: "62%" }} />
      <Handle id="tr" type="target" position={Position.Right} style={{ ...handleStyle, top: "38%" }} />
      <Handle id="sr" type="source" position={Position.Right} style={{ ...handleStyle, top: "62%" }} />
      <div className="flex items-center gap-2">
        <Wallet className="h-4 w-4 text-navy-200" />
        <span className="text-[0.625rem] font-semibold uppercase tracking-[0.1em] text-navy-200">Analyzed wallet</span>
      </div>
      <p className="mt-1 font-mono text-[0.8125rem]">{shortAddress(n.address ?? "", 8, 6)}</p>
      <div className="mt-1.5 flex justify-between text-[0.6875rem] text-navy-200">
        <span>In {formatUsd(n.incomingUsd, { compact: true })}</span>
        <span>Out {formatUsd(n.outgoingUsd, { compact: true })}</span>
      </div>
    </div>
  );
}

function PeerNode({ data, selected }: NodeProps<Node<FlowNodeData>>) {
  const n = data.node;
  const Icon = kindIcon(n.kind);
  const risky = n.riskTags.length > 0;
  const pos = data.side === "left" ? Position.Right : Position.Left;
  const value = n.outgoingUsd + n.incomingUsd;
  return (
    <div
      className={cn(
        "w-[200px] cursor-pointer rounded-lg border bg-card px-3 py-2 shadow-card transition-shadow hover:shadow-md",
        risky && "border-red-300 bg-red-50/60",
        n.sanctioned && "border-red-500 bg-red-50",
        selected && "ring-2 ring-accent/50",
      )}
    >
      <Handle id="s" type="source" position={pos} style={{ ...handleStyle, top: data.side === "left" ? "38%" : "62%" }} />
      <Handle id="t" type="target" position={pos} style={{ ...handleStyle, top: data.side === "left" ? "62%" : "38%" }} />
      <div className="flex items-center gap-2">
        <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md", risky ? "bg-red-100 text-red-700" : "bg-secondary text-navy-700")}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0">
          <p className={cn("truncate text-[0.75rem] font-semibold", n.address && !/[a-z]{3,}/i.test(n.label.replace(/^0x/, "")) && "font-mono font-medium")}>{n.label}</p>
          <p className={cn("truncate text-[0.625rem]", risky ? "font-semibold text-red-700" : "text-muted-foreground")}>
            {kindLabel(n.kind)} · {formatUsd(value, { compact: true })}
          </p>
        </div>
      </div>
    </div>
  );
}

const nodeTypes = { subject: SubjectNode, peer: PeerNode };

function layout(graph: FlowGraph): { nodes: Node<FlowNodeData>[]; edges: Edge[] } {
  const subject = graph.nodes.find((n) => n.kind === "subject")!;
  const peers = graph.nodes.filter((n) => n.kind !== "subject");
  // Net sources on the left, net destinations on the right; "Other" goes last.
  const left = peers.filter((n) => n.outgoingUsd >= n.incomingUsd && n.kind !== "other").sort((a, b) => b.outgoingUsd - a.outgoingUsd);
  const right = peers.filter((n) => n.outgoingUsd < n.incomingUsd && n.kind !== "other").sort((a, b) => b.incomingUsd - a.incomingUsd);
  const other = peers.find((n) => n.kind === "other");
  if (other) (left.length <= right.length ? left : right).push(other);

  const nodes: Node<FlowNodeData>[] = [{ id: subject.id, type: "subject", position: { x: -95, y: -40 }, data: { node: subject, side: "center" }, draggable: true }];
  const place = (list: FlowGraphNode[], side: "left" | "right") => {
    const n = list.length;
    const R = Math.max(340, n * 46);
    list.forEach((node, i) => {
      // Spread on an arc from top to bottom.
      const t = n === 1 ? 0.5 : i / (n - 1);
      const angle = (-70 + 140 * t) * (Math.PI / 180);
      const x = Math.cos(angle) * R * (side === "left" ? -1 : 1);
      const y = Math.sin(angle) * R * 0.95;
      nodes.push({ id: node.id, type: "peer", position: { x: x - 100 + (side === "left" ? -60 : 60), y: y - 22 }, data: { node, side } });
    });
  };
  place(left, "left");
  place(right, "right");

  const sideOf = new Map(nodes.map((n) => [n.id, n.data.side]));
  const maxUsd = Math.max(1, ...graph.edges.map((e) => e.usd));
  const edges: Edge[] = graph.edges.map((e) => {
    const incoming = e.target === "subject";
    const peerId = incoming ? e.source : e.target;
    const side = sideOf.get(peerId) ?? "left";
    const peer = graph.nodes.find((n) => n.id === peerId);
    const risky = (peer?.riskTags.length ?? 0) > 0;
    const color = risky ? RISK : incoming ? IN : OUT;
    const width = 1.25 + 7 * Math.sqrt(e.usd / maxUsd);
    const showLabel = e.usd >= maxUsd * 0.12;
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: incoming ? "s" : side === "left" ? "sl" : "sr",
      targetHandle: incoming ? (side === "left" ? "tl" : "tr") : "t",
      type: "default",
      style: { stroke: color, strokeWidth: width, strokeOpacity: 0.75 },
      markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
      label: showLabel ? formatUsd(e.usd, { compact: true }) : undefined,
      labelStyle: { fontSize: 10, fontWeight: 600, fill: "#334155" },
      labelBgStyle: { fill: "#ffffff", fillOpacity: 0.9 },
      labelBgPadding: [4, 2] as [number, number],
      labelBgBorderRadius: 3,
      data: { usd: e.usd, txCount: e.txCount },
    };
  });
  return { nodes, edges };
}

export function FundFlowGraph({
  graph,
  counterparties,
  transfers,
  chain,
  height = 560,
  interactive = true,
}: {
  graph: FlowGraph;
  counterparties: Counterparty[];
  transfers: Transfer[];
  chain: ChainKey;
  height?: number;
  interactive?: boolean;
}) {
  const { nodes, edges } = React.useMemo(() => layout(graph), [graph]);
  const [selected, setSelected] = React.useState<Counterparty | null>(null);
  const [other, setOther] = React.useState<FlowGraphNode | null>(null);
  const cpMap = React.useMemo(() => new Map(counterparties.map((c) => [c.address, c])), [counterparties]);

  return (
    <div className="relative" style={{ height }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.12 }}
        minZoom={0.3}
        maxZoom={1.8}
        nodesConnectable={false}
        elementsSelectable={interactive}
        nodesDraggable={interactive}
        panOnDrag={interactive}
        zoomOnScroll={false}
        onNodeClick={(_, n) => {
          if (!interactive) return;
          const node = (n.data as FlowNodeData).node;
          if (node.kind === "other") setOther(node);
          else if (node.address && node.kind !== "subject") setSelected(cpMap.get(node.address) ?? null);
        }}
      >
        <Background gap={22} size={1} color="#dfe3ea" />
        {interactive ? <Controls showInteractive={false} position="bottom-right" /> : null}
      </ReactFlow>
      {other && interactive ? (
        <div className="absolute left-3 top-3 z-10 max-w-xs rounded-md border bg-card p-3 text-[0.75rem] shadow-lg">
          <p className="font-semibold">{other.groupedCount} other counterparties</p>
          <p className="mt-1 text-muted-foreground">
            Sent to wallet {formatUsd(other.outgoingUsd)} · received {formatUsd(other.incomingUsd)} · {other.txCount} tx. Grouped to keep the graph readable; see the
            Counterparties table for each address.
          </p>
          <button className="mt-2 text-accent hover:underline" onClick={() => setOther(null)}>
            Close
          </button>
        </div>
      ) : null}
      <CounterpartyDrawer cp={selected} chain={chain} transfers={transfers} open={Boolean(selected)} onOpenChange={(o) => !o && setSelected(null)} />
    </div>
  );
}

export function FundFlowCard(props: { graph: FlowGraph; counterparties: Counterparty[]; transfers: Transfer[]; chain: ChainKey }) {
  const { graph } = props;
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 border-b pb-4">
        <div>
          <CardTitle>Fund Flow</CardTitle>
          <CardDescription>
            1-hop view of the most economically significant counterparties · edge width proportional to value transferred
            {graph.omittedCounterparties ? ` · ${graph.omittedCounterparties} smaller counterparties grouped` : ""}
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-[0.75rem] text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 rounded" style={{ background: IN }} /> Funds received</span>
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 rounded" style={{ background: OUT }} /> Funds sent</span>
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 rounded" style={{ background: RISK }} /> Risk entity flow</span>
          <span className="rounded border px-1.5 py-0.5 text-[0.6875rem]">Depth 1 of {graph.maxSupportedDepth} · 2–3 hop planned</span>
        </div>
      </CardHeader>
      <FundFlowGraph {...props} />
      <p className="border-t bg-muted/40 px-5 py-2 text-[0.6875rem] text-muted-foreground">Click a node for details. Drag to rearrange, use the controls to zoom.</p>
    </Card>
  );
}
