import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { AnalyzeForm } from "@/components/analyze/analyze-form";

export function AnalysisError({ title, message, retry = false }: { title: string; message: string; retry?: boolean }) {
  return (
    <div className="container max-w-2xl py-20">
      <div className="rounded-lg border bg-card p-8 shadow-card">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <h1 className="text-lg font-semibold">{title}</h1>
            <p className="mt-1 text-[0.875rem] text-muted-foreground">{message}</p>
          </div>
        </div>
        <div className="mt-6">
          <AnalyzeForm size="sm" />
        </div>
        <div className="mt-4 flex gap-2">
          <Link href="/" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Back to home
          </Link>
          {retry ? (
            <Link href="?refresh=1" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              Retry
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
