"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "funds", label: "Source of Funds" },
  { id: "flow", label: "Fund Flow" },
  { id: "indicators", label: "Risk Indicators" },
  { id: "counterparties", label: "Counterparties" },
  { id: "transactions", label: "Transactions" },
  { id: "behavior", label: "Behavior" },
  { id: "sources", label: "Data Sources" },
];

export function SectionNav() {
  const [active, setActive] = React.useState("overview");
  React.useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActive(vis[0].target.id);
      },
      { rootMargin: "-120px 0px -60% 0px" },
    );
    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, []);
  return (
    <div className="no-print sticky top-16 z-30 border-b bg-background/95 backdrop-blur">
      <nav className="container flex gap-1 overflow-x-auto py-2">
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className={cn(
              "whitespace-nowrap rounded-md px-3 py-1.5 text-[0.8125rem] font-medium transition-colors",
              active === s.id ? "bg-card text-foreground shadow-card ring-1 ring-border" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {s.label}
          </a>
        ))}
      </nav>
    </div>
  );
}
