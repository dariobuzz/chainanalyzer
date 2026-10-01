import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[0.6875rem] font-medium leading-4 whitespace-nowrap", {
  variants: {
    variant: {
      default: "border-transparent bg-secondary text-secondary-foreground",
      outline: "border-border bg-card text-muted-foreground",
      navy: "border-transparent bg-primary text-primary-foreground",
      demo: "border-amber-300 bg-amber-50 text-amber-800",
      live: "border-emerald-200 bg-emerald-50 text-emerald-800",
      low: "border-green-200 bg-risk-low-bg text-risk-low",
      lowmod: "border-lime-200 bg-risk-lowmod-bg text-risk-lowmod",
      moderate: "border-amber-200 bg-risk-moderate-bg text-risk-moderate",
      high: "border-orange-200 bg-risk-high-bg text-risk-high",
      veryhigh: "border-red-200 bg-risk-veryhigh-bg text-risk-veryhigh",
    },
  },
  defaultVariants: { variant: "default" },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
