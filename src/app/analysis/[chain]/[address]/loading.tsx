"use client";

import * as React from "react";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  "Validating address",
  "Fetching transactions",
  "Resolving counterparties",
  "Screening sanctions & entity intelligence",
  "Computing behavioral indicators",
  "Calculating risk score",
];

export default function Loading() {
  const [step, setStep] = React.useState(0);
  React.useEffect(() => {
    const id = setInterval(() => setStep((s) => Math.min(STEPS.length - 1, s + 1)), 650);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="container flex justify-center py-24">
      <div className="w-full max-w-md rounded-lg border bg-card p-8 shadow-card">
        <p className="eyebrow">Wallet Analysis</p>
        <h1 className="mt-1 text-lg font-semibold">Analyzing wallet…</h1>
        <ul className="mt-6 space-y-3">
          {STEPS.map((s, i) => (
            <li key={s} className={cn("flex items-center gap-3 text-[0.875rem]", i > step && "text-muted-foreground/60")}>
              <span className="flex h-5 w-5 items-center justify-center">
                {i < step ? <Check className="h-4 w-4 text-emerald-600" /> : i === step ? <Loader2 className="h-4 w-4 animate-spin text-accent" /> : <span className="h-1.5 w-1.5 rounded-full bg-border" />}
              </span>
              {s}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
