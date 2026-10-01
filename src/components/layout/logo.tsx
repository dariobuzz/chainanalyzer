import { cn } from "@/lib/utils";

/** ChainScope mark: a scope reticle over linked nodes. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("h-7 w-7", className)} aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="#0f2442" />
      <circle cx="16" cy="16" r="8.5" fill="none" stroke="#8fb4e8" strokeWidth="1.6" />
      <path d="M16 4.5v4M16 23.5v4M4.5 16h4M23.5 16h4" stroke="#8fb4e8" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12.5" cy="17.5" r="2" fill="#ffffff" />
      <circle cx="19.5" cy="13" r="2" fill="#ffffff" />
      <path d="M13.9 16.4l4.2-2.4" stroke="#ffffff" strokeWidth="1.4" />
    </svg>
  );
}

export function Logo({ className, subtitle = true }: { className?: string; subtitle?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="flex flex-col leading-none">
        <span className="text-[0.975rem] font-semibold tracking-tight text-navy-900">ChainScope</span>
        {subtitle ? <span className="mt-0.5 text-[0.625rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">Wallet Intelligence</span> : null}
      </span>
    </span>
  );
}
