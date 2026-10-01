"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Search } from "lucide-react";
import type { ChainKey } from "@/types/domain";
import { CHAINS, SUPPORTED_CHAINS } from "@/services/blockchain/chains";
import { ADDRESS_PLACEHOLDER, canonicalAddress, detectFamily, invalidAddressMessage } from "@/lib/addresses";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function AnalyzeForm({ size = "lg", defaultChain = "ethereum" }: { size?: "lg" | "sm"; defaultChain?: ChainKey }) {
  const router = useRouter();
  const [address, setAddress] = React.useState("");
  const [chain, setChain] = React.useState<ChainKey>(defaultChain);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    // The network is chosen explicitly, but a non-EVM address format identifies its chain unambiguously.
    let target = chain;
    if (!canonicalAddress(chain, address)) {
      const family = detectFamily(address);
      const detected = family && family !== "evm" ? SUPPORTED_CHAINS.find((c) => CHAINS[c].family === family) : undefined;
      if (detected) target = detected;
    }
    const a = canonicalAddress(target, address);
    if (!a) {
      setError(invalidAddressMessage(chain));
      return;
    }
    setError(null);
    if (target !== chain) setChain(target);
    startTransition(() => router.push(`/analysis/${target}/${encodeURIComponent(a)}`));
  }

  function onAddressChange(v: string) {
    setAddress(v);
    const family = detectFamily(v);
    // Switch the network selector when the address can only belong to another family.
    if (family && family !== CHAINS[chain].family) {
      const match = SUPPORTED_CHAINS.find((c) => CHAINS[c].family === family);
      if (match) setChain(match);
    }
  }

  const lg = size === "lg";
  return (
    <form onSubmit={submit} className="w-full" noValidate>
      <div
        className={cn(
          "flex flex-col gap-2 rounded-xl border bg-card p-2 shadow-card sm:flex-row sm:items-center",
          error && "border-red-300",
          lg && "p-2.5",
        )}
      >
        <div className="flex flex-1 items-center gap-2 px-2">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            value={address}
            onChange={(e) => onAddressChange(e.target.value)}
            placeholder={`Enter wallet address (${ADDRESS_PLACEHOLDER[CHAINS[chain].family]})`}
            aria-label="Wallet address"
            spellCheck={false}
            autoComplete="off"
            className={cn("w-full bg-transparent font-mono outline-none placeholder:font-sans placeholder:text-muted-foreground/70", lg ? "h-11 text-[0.9375rem]" : "h-9 text-sm")}
          />
        </div>
        <div className="flex gap-2">
          <select
            value={chain}
            onChange={(e) => setChain(e.target.value as ChainKey)}
            aria-label="Blockchain"
            className={cn("rounded-lg border border-input bg-muted/50 px-3 text-sm font-medium outline-none focus:ring-2 focus:ring-ring/30", lg ? "h-11" : "h-9")}
          >
            {SUPPORTED_CHAINS.map((c) => (
              <option key={c} value={c}>
                {CHAINS[c].name}
              </option>
            ))}
          </select>
          <Button type="submit" size={lg ? "lg" : "default"} disabled={pending} className="flex-1 sm:flex-none">
            {pending ? <Loader2 className="animate-spin" /> : null}
            Analyze Wallet
            {!pending ? <ArrowRight /> : null}
          </Button>
        </div>
      </div>
      {error ? <p className="mt-2 px-1 text-[0.8125rem] text-red-700">{error}</p> : null}
    </form>
  );
}
