"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

export function CopyButton({ value, className, label }: { value: string; className?: string; label?: string }) {
  const [done, setDone] = React.useState(false);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard?.writeText(value).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1400);
        });
      }}
      className={cn("inline-flex items-center gap-1 rounded p-0.5 text-muted-foreground hover:text-foreground", className)}
      aria-label={label ?? "Copy"}
      title={label ?? "Copy"}
    >
      {done ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
      {label ? <span className="text-[0.8125rem]">{done ? "Copied" : label}</span> : null}
    </button>
  );
}

