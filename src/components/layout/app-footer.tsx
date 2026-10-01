import { DISCLAIMER } from "@/lib/constants";
import { LogoMark } from "./logo";

export function AppFooter() {
  return (
    <footer className="no-print mt-16 border-t bg-card">
      <div className="container flex flex-col gap-4 py-8 md:flex-row md:items-start md:justify-between">
        <div className="flex items-center gap-2 text-[0.8125rem] font-medium text-navy-800">
          <LogoMark className="h-5 w-5" /> ChainScope <span className="font-normal text-muted-foreground">· Crypto AML &amp; Wallet Intelligence</span>
        </div>
        <p className="max-w-3xl text-[0.75rem] leading-relaxed text-muted-foreground">{DISCLAIMER}</p>
      </div>
    </footer>
  );
}

export function DemoBanner() {
  return (
    <div className="no-print border-b border-amber-200 bg-amber-50">
      <div className="container py-1.5 text-center text-[0.75rem] text-amber-900">
        <strong className="font-semibold">Demo Mode</strong> — analyses use a synthetic, clearly-labelled demo dataset. Results do not describe real wallets.
        Set <code className="rounded bg-amber-100 px-1">DEMO_MODE=false</code> to use live blockchain data.
      </div>
    </div>
  );
}
