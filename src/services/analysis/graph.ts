import type { Counterparty, FlowGraph, FlowGraphEdge, FlowGraphNode } from "@/types/domain";
import { shortAddress } from "@/lib/format";

export const MAX_SUPPORTED_DEPTH = 1;
const DEFAULT_MAX_NODES = 14;

/**
 * Fund-flow graph builder.
 *
 * Depth 1 (implemented): subject ↔ its most economically significant counterparties.
 * Depth 2–3 (planned): `expand(node)` will fetch the counterparty's own history via
 * the same BlockchainProvider, apply the same pricing/labelling, and attach its top-N
 * counterparties as hop+1 nodes with a global node budget. Node ids are address-based
 * so expansions merge into the existing graph without duplication.
 */
export function buildFundFlowGraph(
  subject: string,
  counterparties: Counterparty[],
  opts: { depth?: number; maxNodes?: number } = {},
): FlowGraph {
  const depth = opts.depth ?? 1;
  if (depth > MAX_SUPPORTED_DEPTH) {
    throw new Error(`Graph depth ${depth} not yet available (max ${MAX_SUPPORTED_DEPTH}).`);
  }
  const maxNodes = opts.maxNodes ?? DEFAULT_MAX_NODES;

  // Always keep risk-relevant counterparties visible, then the largest by value.
  const risky = counterparties.filter((c) => c.riskTags.length > 0);
  const rest = counterparties.filter((c) => c.riskTags.length === 0);
  const selected = [...risky.slice(0, maxNodes), ...rest.slice(0, Math.max(0, maxNodes - risky.length))];
  const selectedSet = new Set(selected.map((c) => c.address));
  const omitted = counterparties.filter((c) => !selectedSet.has(c.address));

  const nodes: FlowGraphNode[] = [
    {
      id: "subject",
      address: subject,
      label: shortAddress(subject),
      kind: "subject",
      hop: 0,
      incomingUsd: counterparties.reduce((s, c) => s + c.incomingUsd, 0),
      outgoingUsd: counterparties.reduce((s, c) => s + c.outgoingUsd, 0),
      txCount: counterparties.reduce((s, c) => s + c.txCount, 0),
      riskTags: [],
      sanctioned: false,
    },
  ];
  const edges: FlowGraphEdge[] = [];

  for (const c of selected) {
    nodes.push({
      id: c.address,
      address: c.address,
      label: c.label || c.sanction ? c.displayName : shortAddress(c.address),
      kind: c.type,
      hop: 1,
      incomingUsd: c.outgoingUsd, // from the node's perspective: what it received from the subject
      outgoingUsd: c.incomingUsd,
      txCount: c.txCount,
      riskTags: c.riskTags,
      sanctioned: Boolean(c.sanction),
    });
    if (c.incomingCount > 0) edges.push({ id: `${c.address}->subject`, source: c.address, target: "subject", usd: c.incomingUsd, txCount: c.incomingCount });
    if (c.outgoingCount > 0) edges.push({ id: `subject->${c.address}`, source: "subject", target: c.address, usd: c.outgoingUsd, txCount: c.outgoingCount });
  }

  if (omitted.length) {
    const inUsd = omitted.reduce((s, c) => s + c.incomingUsd, 0);
    const outUsd = omitted.reduce((s, c) => s + c.outgoingUsd, 0);
    nodes.push({
      id: "other",
      address: null,
      label: `${omitted.length} other counterparties`,
      kind: "other",
      hop: 1,
      incomingUsd: outUsd,
      outgoingUsd: inUsd,
      txCount: omitted.reduce((s, c) => s + c.txCount, 0),
      riskTags: [],
      sanctioned: false,
      groupedCount: omitted.length,
    });
    const inCount = omitted.reduce((s, c) => s + c.incomingCount, 0);
    const outCount = omitted.reduce((s, c) => s + c.outgoingCount, 0);
    if (inCount) edges.push({ id: "other->subject", source: "other", target: "subject", usd: inUsd, txCount: inCount });
    if (outCount) edges.push({ id: "subject->other", source: "subject", target: "other", usd: outUsd, txCount: outCount });
  }

  return { depth, maxSupportedDepth: MAX_SUPPORTED_DEPTH, nodes, edges, omittedCounterparties: omitted.length };
}
