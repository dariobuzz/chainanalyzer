"use client";

import Link from "next/link";
import { ArrowLeft, Download, Printer } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";

export function ReportToolbar({ backHref, registered }: { backHref: string; registered: boolean }) {
  return (
    <div className="no-print sticky top-16 z-30 border-b bg-card/95 backdrop-blur">
      <div className="container flex flex-wrap items-center justify-between gap-3 py-3">
        <Link href={backHref} className={buttonVariants({ variant: "ghost", size: "sm" })}>
          <ArrowLeft /> Back to analysis
        </Link>
        <div className="flex items-center gap-2">
          {!registered ? <span className="text-[0.75rem] text-amber-800">Preview — not registered. Use “Generate Report” on the analysis page to assign a Report ID.</span> : null}
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer /> Print
          </Button>
          <Button size="sm" onClick={() => window.print()} title="Select “Save as PDF” as destination in the print dialog">
            <Download /> Export PDF
          </Button>
        </div>
      </div>
    </div>
  );
}
