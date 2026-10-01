import type { Metadata } from "next";
import { getStore } from "@/lib/db";
import { InvestigationsTable } from "@/components/investigations/investigations-table";
import { PageHeader } from "@/components/layout/page-header";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Investigations" };

export default async function InvestigationsPage() {
  const items = await getStore().listInvestigations();
  return (
    <div>
      <PageHeader eyebrow="Case management" title="Investigations" description="Track wallet reviews, add internal references and record the outcome. No personal data is required." />
      <div className="container py-8">
        <InvestigationsTable initial={items} />
      </div>
    </div>
  );
}
