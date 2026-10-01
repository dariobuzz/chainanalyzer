import type { ReportRecord, WalletAnalysis } from "@/types/domain";
import { DISCLAIMER, ENTITY_TYPE_LABEL, METHODOLOGY_VERSION, NO_INTEL, RISK_CATEGORY_LABEL, RISK_LEVELS, RISK_NOTICE } from "@/lib/constants";
import { formatAmount, formatDate, formatDateTime, formatNumber, formatPct, formatUsd, shortAddress } from "@/lib/format";
import { CHAINS } from "@/services/blockchain/chains";
import { RISK_STYLE } from "@/lib/risk-style";
import { Logo } from "@/components/layout/logo";
import { RiskGauge } from "@/components/analysis/risk-gauge";
import { FundFlowGraph } from "@/components/analysis/fund-flow-graph";

function H({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <h2 className="mb-3 mt-9 flex items-baseline gap-3 border-b border-navy-900/80 pb-1.5 text-[0.9375rem] font-semibold tracking-tight text-navy-900">
      <span className="mono text-[0.75rem] text-muted-foreground">{String(n).padStart(2, "0")}</span>
      {children}
    </h2>
  );
}

function KV({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <table className="w-full text-[0.8125rem]">
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k} className="border-b border-border/70 last:border-0">
            <td className="w-[42%] py-1.5 pr-4 text-muted-foreground">{k}</td>
            <td className="py-1.5 font-medium">{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Grid({ head, rows, align }: { head: string[]; rows: React.ReactNode[][]; align?: ("l" | "r")[] }) {
  return (
    <table className="w-full text-[0.75rem]">
      <thead>
        <tr className="border-b bg-muted/60">
          {head.map((h, i) => (
            <th key={h} className={`px-2 py-1.5 font-semibold uppercase tracking-wide text-muted-foreground ${align?.[i] === "r" ? "text-right" : "text-left"}`} style={{ fontSize: "0.625rem" }}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="print-avoid-break border-b border-border/70">
            {r.map((c, j) => (
              <td key={j} className={`px-2 py-1.5 align-top ${align?.[j] === "r" ? "text-right tabular" : ""}`}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ReportDocument({ analysis: a, report }: { analysis: WalletAnalysis; report: ReportRecord | null }) {
  const chain = CHAINS[a.chain];
  const style = RISK_STYLE[a.risk.riskLevel];
  const reportId = report?.id ?? "PREVIEW (unregistered)";
  const generated = report?.createdAt ?? new Date().toISOString();
  const verified = a.risk.indicators.filter((i) => i.group === "verified_intelligence");
  const behavioral = a.risk.indicators.filter((i) => i.group === "behavioral");
  const relevantTx = [...a.transfers]
    .filter((t) => !t.isError && t.amount > 0)
    .sort((x, y) => {
      const rx = a.counterparties.find((c) => c.address === x.counterparty)?.riskTags.length ?? 0;
      const ry = a.counterparties.find((c) => c.address === y.counterparty)?.riskTags.length ?? 0;
      return ry - rx || (y.usdValue ?? 0) - (x.usdValue ?? 0);
    })
    .slice(0, 15);
  const cpMap = new Map(a.counterparties.map((c) => [c.address, c]));
  const statusText = (s: string) =>
    s === "detected" ? "Detected" : s === "not_detected" ? "Not detected" : s === "insufficient_data" ? "Insufficient data" : NO_INTEL;

  return (
    <article className="report-sheet mx-auto my-8 max-w-[900px] rounded-lg border bg-white px-12 py-10 shadow-card">
      {a.dataMode === "demo" ? (
        <div className="mb-6 rounded-md border-2 border-amber-400 bg-amber-50 px-4 py-2 text-center text-[0.8125rem] font-semibold text-amber-900">
          DEMO DATA — This report is generated from a synthetic demonstration dataset and does not describe a real wallet.
        </div>
      ) : null}

      {/* Cover */}
      <header className="flex items-start justify-between gap-6 border-b pb-6">
        <div>
          <Logo />
          <h1 className="mt-6 text-[1.625rem] font-semibold tracking-tight text-navy-900">Wallet Compliance Report</h1>
          <p className="mt-1 text-[0.875rem] text-muted-foreground">Crypto AML &amp; Wallet Intelligence — preliminary due diligence</p>
        </div>
        <div className="text-right text-[0.75rem]">
          <p className="eyebrow">Report ID</p>
          <p className="mono mt-0.5 font-semibold">{reportId}</p>
          <p className="eyebrow mt-3">Generation date</p>
          <p className="mt-0.5">{formatDateTime(generated)}</p>
          <p className="eyebrow mt-3">Analysis timestamp</p>
          <p className="mt-0.5">{formatDateTime(a.generatedAt)}</p>
        </div>
      </header>

      <section className="mt-6 grid grid-cols-[1fr_auto] gap-6">
        <KV
          rows={[
            ["Wallet address", <span key="a" className="mono break-all">{a.address}</span>],
            ["Blockchain", chain.name],
            ["Data mode", a.dataMode === "demo" ? "Demo data (synthetic)" : "Live blockchain data"],
            ["Methodology", `${METHODOLOGY_VERSION}`],
            ["Analysis confidence", `${a.risk.confidence.level} (${a.risk.confidence.score}/100)`],
          ]}
        />
        <div className="flex w-[220px] flex-col items-center rounded-lg border p-3">
          <p className="eyebrow">Risk Score</p>
          <RiskGauge score={a.risk.riskScore} level={a.risk.riskLevel} size={190} />
          <span className="rounded-full px-3 py-0.5 text-[0.8125rem] font-semibold" style={{ color: style.color, background: style.bg }}>
            {a.risk.riskLevel}
          </span>
        </div>
      </section>

      <H n={1}>Executive Summary</H>
      <div className="space-y-2 text-[0.875rem] leading-relaxed">
        {a.summary.map((s, i) => (
          <p key={i}>{s}</p>
        ))}
      </div>
      <p className="mt-3 rounded-md bg-muted/60 px-3 py-2 text-[0.75rem] text-muted-foreground">{RISK_NOTICE}</p>

      <H n={2}>Risk Score</H>
      <div className="grid grid-cols-5 gap-1 text-center text-[0.6875rem]">
        {RISK_LEVELS.map((b) => (
          <div
            key={b.level}
            className="rounded px-1 py-1.5"
            style={{ background: b.level === a.risk.riskLevel ? RISK_STYLE[b.level].color : "#f1f3f6", color: b.level === a.risk.riskLevel ? "#fff" : "#6b7385" }}
          >
            <p className="font-semibold">{b.level}</p>
            <p>
              {b.min}–{b.max}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[0.8125rem]">
        The score is the sum of the contributions of the documented risk factors below, capped at 100. A direct sanctions match on the analyzed address sets the score to 100.
        Categories without a reliable intelligence source contribute no points.
      </p>

      <H n={3}>Risk Factors</H>
      {a.risk.riskFactors.length === 0 ? (
        <p className="text-[0.8125rem] text-muted-foreground">No risk factors were detected.</p>
      ) : (
        <Grid
          head={["Category", "Severity", "Points", "Description & evidence", "Source"]}
          align={["l", "l", "r", "l", "l"]}
          rows={a.risk.riskFactors.map((f) => [
            <span key="c" className="font-medium">{RISK_CATEGORY_LABEL[f.category]}</span>,
            <span key="s" className="capitalize">{f.severity}</span>,
            `+${f.scoreContribution}`,
            <div key="d">
              <p>{f.description}</p>
              {f.evidence.slice(0, 4).map((e, i) => (
                <p key={i} className="mono mt-0.5 text-[0.625rem] text-muted-foreground">
                  {e}
                </p>
              ))}
            </div>,
            <span key="src" className="text-muted-foreground">{f.source}</span>,
          ])}
        />
      )}
      <div className="mt-4 grid grid-cols-2 gap-6">
        <div>
          <p className="eyebrow mb-1">Verified intelligence — all categories</p>
          <Grid head={["Category", "Status"]} rows={verified.map((i) => [i.label, statusText(i.status)])} />
        </div>
        <div>
          <p className="eyebrow mb-1">Behavioral indicators — all categories</p>
          <Grid head={["Category", "Status"]} rows={behavioral.map((i) => [i.label, statusText(i.status)])} />
        </div>
      </div>

      <H n={4}>Wallet Overview</H>
      <div className="grid grid-cols-2 gap-x-8">
        <KV
          rows={[
            ["Native balance", a.overview.nativeBalance === null ? "—" : `${formatAmount(a.overview.nativeBalance)} ${a.overview.nativeSymbol} (${formatUsd(a.overview.nativeBalanceUsd)})`],
            ["Estimated portfolio value", formatUsd(a.overview.portfolioUsd)],
            ["First activity", formatDate(a.overview.firstActivity)],
            ["Last activity", formatDate(a.overview.lastActivity)],
            ["Total transactions", `${a.overview.totalTransactions.isLowerBound ? "≥ " : ""}${formatNumber(a.overview.totalTransactions.value)}`],
          ]}
        />
        <KV
          rows={[
            ["Transactions analyzed", formatNumber(a.overview.transactionsAnalyzed)],
            ["Total incoming (priced)", formatUsd(a.overview.totalIncomingUsd)],
            ["Total outgoing (priced)", formatUsd(a.overview.totalOutgoingUsd)],
            ["Unique counterparties", formatNumber(a.overview.uniqueCounterparties)],
            ["Main assets", a.overview.topAssetsMoved.slice(0, 5).map((t) => t.symbol).join(", ") || "—"],
          ]}
        />
      </div>

      <div className="print-break-before" />
      <div className="grid grid-cols-2 gap-8">
        <div>
          <H n={5}>Source of Funds</H>
          <Grid
            head={["Source", "Type", "USD", "%"]}
            align={["l", "l", "r", "r"]}
            rows={a.flows.sources.map((b) => [b.label, b.type === "other" ? "Other" : ENTITY_TYPE_LABEL[b.type], formatUsd(b.usd, { compact: true }), formatPct(b.pct)])}
          />
        </div>
        <div>
          <H n={6}>Destination of Funds</H>
          <Grid
            head={["Destination", "Type", "USD", "%"]}
            align={["l", "l", "r", "r"]}
            rows={a.flows.destinations.map((b) => [b.label, b.type === "other" ? "Other" : ENTITY_TYPE_LABEL[b.type], formatUsd(b.usd, { compact: true }), formatPct(b.pct)])}
          />
        </div>
      </div>

      <H n={7}>Counterparties</H>
      <Grid
        head={["Entity / Address", "Type", "Incoming", "Outgoing", "Tx", "Exposure", "Risk"]}
        align={["l", "l", "r", "r", "r", "r", "l"]}
        rows={a.counterparties.slice(0, 15).map((c) => [
          <div key="e">
            <p className="font-medium">{c.displayName}</p>
            <p className="mono text-[0.625rem] text-muted-foreground">{c.address}</p>
          </div>,
          ENTITY_TYPE_LABEL[c.type],
          formatUsd(c.incomingUsd, { compact: true }),
          formatUsd(c.outgoingUsd, { compact: true }),
          formatNumber(c.txCount),
          formatPct(c.exposurePct),
          c.riskTags.length ? <span key="r" className="font-semibold text-risk-veryhigh">{c.riskTags.map((t) => RISK_CATEGORY_LABEL[t]).join(", ")}</span> : c.label ? "None identified" : "Unknown",
        ])}
      />
      {a.counterparties.length > 15 ? <p className="mt-1 text-[0.6875rem] text-muted-foreground">Top 15 of {a.counterparties.length} counterparties by value.</p> : null}

      <H n={8}>Relevant Transactions</H>
      <p className="mb-2 text-[0.75rem] text-muted-foreground">Transfers involving risk-flagged counterparties first, then the largest by USD value.</p>
      <Grid
        head={["Date", "Hash", "Dir.", "Counterparty", "Amount", "USD", "Indicator"]}
        align={["l", "l", "l", "l", "r", "r", "l"]}
        rows={relevantTx.map((t) => {
          const cp = cpMap.get(t.counterparty);
          return [
            formatDate(t.timestamp),
            <span key="h" className="mono">{shortAddress(t.hash, 8, 6)}</span>,
            t.direction === "in" ? "In" : "Out",
            cp?.displayName ?? shortAddress(t.counterparty),
            `${formatAmount(t.amount)} ${t.asset.symbol}`,
            formatUsd(t.usdValue),
            cp?.riskTags.length ? RISK_CATEGORY_LABEL[cp.riskTags[0]] : "—",
          ];
        })}
      />

      <div className="print-break-before" />
      <H n={9}>Fund Flow</H>
      <div className="rounded-lg border">
        <FundFlowGraph graph={a.graph} counterparties={a.counterparties} transfers={a.transfers} chain={a.chain} height={460} interactive={false} />
      </div>
      <p className="mt-1 text-[0.6875rem] text-muted-foreground">
        1-hop fund flow. Blue: funds received; orange: funds sent; red: flows with risk-flagged entities. Edge width proportional to USD value.
      </p>

      <H n={10}>Data Sources</H>
      <Grid
        head={["Source", "Type", "Detail", "As of"]}
        rows={a.risk.dataSources.map((s) => [
          <span key="n" className="font-medium">{s.name}</span>,
          s.kind,
          s.detail,
          s.asOf && s.asOf !== "demo" ? (/^\d{4}-\d{2}-\d{2}$/.test(s.asOf) ? s.asOf : formatDate(s.asOf)) : "—",
        ])}
      />

      <H n={11}>Methodology</H>
      <div className="space-y-2 text-[0.8125rem] leading-relaxed">
        <p>
          <strong>Data acquisition.</strong> Native, token and internal transfers of the wallet are retrieved through the ChainScope provider layer and normalized. USD values
          use {a.pricing.source.toLowerCase()}; {a.pricing.note}
        </p>
        <p>
          <strong>Counterparty resolution.</strong> Each counterparty is matched against the ChainScope Entity Registry (curated public labels) and screened by exact address match
          against the OFAC SDN list. Unmatched addresses are reported as unknown; no attribution is inferred.
        </p>
        <p>
          <strong>Verified intelligence vs. behavioral indicators.</strong> Verified-intelligence categories (sanctions, scam, mixer, darknet, ransomware, stolen funds, high-risk
          exchange, unlicensed service, gambling) score only on a verified match, scaled by exposure share. Behavioral indicators (bridge/DEX exposure, velocity, wallet age,
          pass-through and threshold-avoidance patterns) are computed from on-chain observations using fixed, documented thresholds.
        </p>
        <p>
          <strong>Score.</strong> Risk score = min(100, Σ factor contributions); 0–20 Low, 21–40 Low/Moderate, 41–60 Moderate, 61–80 High, 81–100 Very High. Confidence reflects
          data completeness: {a.risk.confidence.reasons.join(" ")}
        </p>
        <p>
          <strong>Summary.</strong> The executive summary is assembled from fixed templates populated with measured values. No generative AI is used to produce conclusions.
        </p>
      </div>

      <H n={12}>Disclaimer</H>
      <p className="text-[0.8125rem] leading-relaxed">{DISCLAIMER}</p>
      <p className="mt-2 text-[0.8125rem] leading-relaxed">{RISK_NOTICE}</p>

      <footer className="mt-10 flex items-center justify-between border-t pt-3 text-[0.6875rem] text-muted-foreground">
        <span>ChainScope · {reportId}</span>
        <span>{a.address}</span>
      </footer>
    </article>
  );
}
