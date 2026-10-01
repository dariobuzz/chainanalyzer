"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ScanSearch } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { buttonVariants } from "@/components/ui/button";
import type { DataMode } from "@/types/domain";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/investigations", label: "Investigations" },
  { href: "/reports", label: "Reports" },
  { href: "/settings", label: "Settings" },
];

export function AppHeader({ mode }: { mode: DataMode }) {
  const pathname = usePathname();
  return (
    <header className="no-print sticky top-0 z-40 border-b bg-card/90 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="container flex h-16 items-center gap-8">
        <Link href="/" aria-label="ChainScope home">
          <Logo />
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((n) => {
            const active = pathname === n.href || pathname.startsWith(`${n.href}/`);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={cn(
                  "rounded-md px-3 py-1.5 text-[0.8125rem] font-medium transition-colors",
                  active ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          {mode === "demo" ? (
            <span className="hidden items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-amber-800 sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Demo Mode
            </span>
          ) : (
            <span className="hidden items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-emerald-800 sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Live Data
            </span>
          )}
          <Link href="/#analyze" className={buttonVariants({ size: "sm" })}>
            <ScanSearch /> Analyze Wallet
          </Link>
        </div>
      </div>
    </header>
  );
}
