"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { MonthlyActivity } from "@/types/domain";
import { formatMonth, formatNumber, formatUsd } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const IN = "#2a78d6";
const OUT = "#eb6834";

const monthLabel = formatMonth;

interface TipProps {
  active?: boolean;
  payload?: { payload: MonthlyActivity }[];
}

function Tip({ active, payload }: TipProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-md border bg-card px-3 py-2 text-[0.75rem] shadow-lg">
      <p className="mb-1 font-semibold">{monthLabel(d.month)}</p>
      <p className="flex items-center gap-2"><span className="h-2 w-2 rounded-sm" style={{ background: IN }} /> Incoming <span className="ml-auto pl-4 font-medium tabular">{formatUsd(d.incomingUsd)}</span></p>
      <p className="flex items-center gap-2"><span className="h-2 w-2 rounded-sm" style={{ background: OUT }} /> Outgoing <span className="ml-auto pl-4 font-medium tabular">{formatUsd(d.outgoingUsd)}</span></p>
      <p className="mt-1 text-muted-foreground">{formatNumber(d.txCount)} transactions</p>
    </div>
  );
}

export function ActivityChart({ data }: { data: MonthlyActivity[] }) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between">
        <div>
          <CardTitle>Monthly value flow</CardTitle>
          <CardDescription>Priced incoming vs. outgoing value per month (USD)</CardDescription>
        </div>
        <div className="flex items-center gap-4 text-[0.75rem] text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: IN }} /> Incoming</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: OUT }} /> Outgoing</span>
        </div>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="py-10 text-center text-[0.8125rem] text-muted-foreground">No activity to display.</p>
        ) : (
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} barGap={2} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fontSize: 11, fill: "var(--chart-axis)" }} tickLine={false} axisLine={false} minTickGap={16} />
                <YAxis tickFormatter={(v: number) => formatUsd(v, { compact: true })} tick={{ fontSize: 11, fill: "var(--chart-axis)" }} tickLine={false} axisLine={false} width={64} />
                <Tooltip content={<Tip />} cursor={{ fill: "rgba(15,36,66,0.04)" }} />
                <Bar dataKey="incomingUsd" name="Incoming" fill={IN} radius={[3, 3, 0, 0]} maxBarSize={18} isAnimationActive={false} />
                <Bar dataKey="outgoingUsd" name="Outgoing" fill={OUT} radius={[3, 3, 0, 0]} maxBarSize={18} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
