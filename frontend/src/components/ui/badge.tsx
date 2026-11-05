import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-[var(--phact-navy)] text-white",
        orange: "border-transparent bg-[var(--phact-orange)] text-white",
        teal: "border-transparent bg-[var(--phact-teal)] text-white",
        outline: "border-[var(--phact-border)] text-[var(--phact-navy)]",
        soft: "border-transparent bg-[var(--phact-teal-soft)] text-[var(--phact-navy)]",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
