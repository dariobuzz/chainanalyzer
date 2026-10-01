import Link from "next/link";
import { ArrowRight, FileText, GitFork, Gauge, ListTree, ShieldCheck, Wallet } from "lucide-react";
import { config } from "@/lib/config";
import { RISK_NOTICE } from "@/lib/constants";
import { shortAddress } from "@/lib/format";
import { CHAINS, PLANNED_CHAINS } from "@/services/blockchain/chains";
import { DEMO_WALLETS } from "@/services/demo/wallets";
import { AnalyzeForm } from "@/components/analyze/analyze-form";
import { Badge } from "@/components/ui/badge";

const STEPS = [
  { icon: Wallet, title: "Wallet", text: "Balance, activity window and holdings" },
  { icon: ListTree, title: "Transactions", text: "Normalized native, token and internal transfers" },
  { icon: GitFork, title: "Counterparties", text: "Exchanges, DEXs, bridges and unknown entities" },
  { icon: Gauge, title: "Risk", text: "Explainable score from documented indicators" },
  { icon: FileText, title: "Report", text: "Printable compliance report with methodology" },
];

const PROFILE_TONE = { low: "low", moderate: "moderate", high: "veryhigh" } as const;

export default function HomePage() {
  const demo = config.demoMode;
  return (
    <div>
      <section className="relative overflow-hidden border-b bg-card">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.55]"
          style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, hsl(218 20% 86%) 1px, transparent 0)",
            backgroundSize: "22px 22px",
            maskImage: "linear-gradient(to bottom, black, transparent 85%)",
          }}
        />
        <div className="container relative flex flex-col items-center py-20 text-center md:py-28" id="analyze">
          <Badge variant="outline" className="mb-6 gap-1.5 px-3 py-1 text-[0.75rem]">
            <ShieldCheck className="h-3.5 w-3.5 text-accent" /> AML · Compliance · Digital asset due diligence
          </Badge>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-navy-900 md:text-[3.25rem] md:leading-[1.08]">
            Understand where crypto funds come from.
          </h1>
          <p className="mt-5 max-w-2xl text-[1.0625rem] leading-relaxed text-muted-foreground">
            Blockchain intelligence for AML, compliance and digital asset due diligence.
          </p>
          <div className="mt-10 w-full max-w-3xl">
            <AnalyzeForm />
            <p className="mt-3 text-[0.75rem] text-muted-foreground">
              Supported: {Object.values(CHAINS).map((c) => c.name).join(" · ")}
              <span className="mx-2 text-border">|</span>
              Coming next: {PLANNED_CHAINS.map((c) => c.name).join(", ")}
            </p>
          </div>

          {demo ? (
            <div className="mt-10 w-full max-w-4xl text-left">
              <div className="mb-3 flex items-center justify-center gap-2">
                <Badge variant="demo">Demo Data</Badge>
                <span className="text-[0.8125rem] text-muted-foreground">Sample wallets for a guided walkthrough (synthetic)</span>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {DEMO_WALLETS.map((w) => (
                  <Link
                    key={w.address + w.chain}
                    href={`/analysis/${w.chain}/${w.address}`}
                    className="group flex items-start justify-between gap-3 rounded-lg border bg-card p-4 shadow-card transition-colors hover:border-accent/50"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[0.875rem] font-medium text-foreground">{w.title}</span>
                      </div>
                      <p className="mt-1 text-[0.8125rem] text-muted-foreground">{w.description}</p>
                      <p className="mt-2 flex items-center gap-2 text-[0.75rem] text-muted-foreground">
                        <span className="mono">{shortAddress(w.address, 8, 6)}</span>
                        <span>· {CHAINS[w.chain].name}</span>
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge variant={PROFILE_TONE[w.profile]} className="capitalize">
                        {w.profile} risk profile
                      </Badge>
                      <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section className="container py-16">
        <p className="eyebrow text-center">How ChainScope works</p>
        <h2 className="mt-2 text-center text-2xl font-semibold tracking-tight text-navy-900">From address to documented risk assessment</h2>
        <ol className="mt-10 grid gap-3 md:grid-cols-5">
          {STEPS.map((s, i) => (
            <li key={s.title} className="relative rounded-lg border bg-card p-5 shadow-card">
              <div className="flex items-center justify-between">
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-secondary text-navy-800">
                  <s.icon className="h-4 w-4" />
                </span>
                <span className="mono text-[0.6875rem] text-muted-foreground">0{i + 1}</span>
              </div>
              <p className="mt-4 text-[0.8125rem] font-semibold uppercase tracking-[0.08em] text-navy-900">{s.title}</p>
              <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted-foreground">{s.text}</p>
              {i < STEPS.length - 1 ? (
                <ArrowRight className="absolute -right-[11px] top-1/2 z-10 hidden h-4 w-4 -translate-y-1/2 rounded-full bg-background text-muted-foreground md:block" />
              ) : null}
            </li>
          ))}
        </ol>

        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {[
            { t: "Explainable by design", d: "Every risk point is traceable to a documented indicator with evidence and source. No black-box scores." },
            { t: "Verified vs. behavioral", d: "Sanctions and labelled-entity intelligence are kept separate from patterns observed on-chain." },
            { t: "No source, no classification", d: "Where no reliable intelligence exists, ChainScope says so explicitly and attributes no risk." },
          ].map((f) => (
            <div key={f.t} className="rounded-lg border bg-card p-5">
              <p className="text-[0.875rem] font-semibold text-navy-900">{f.t}</p>
              <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-muted-foreground">{f.d}</p>
            </div>
          ))}
        </div>
        <p className="mt-8 text-center text-[0.75rem] text-muted-foreground">{RISK_NOTICE}</p>
      </section>
    </div>
  );
}
