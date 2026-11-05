import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--phact-navy)] !text-white hover:bg-[var(--phact-navy-2)] [&_svg]:!text-white",
        orange:
          "bg-[var(--phact-orange)] !text-white hover:bg-[var(--phact-orange-dark)] shadow-sm [&_svg]:!text-white",
        teal:
          "bg-[var(--phact-teal)] !text-white hover:brightness-95 [&_svg]:!text-white",
        outline:
          "border-2 border-current bg-transparent text-[var(--phact-navy)] hover:bg-white/10",
        ghost: "bg-transparent text-[var(--phact-navy)] hover:bg-black/5",
        secondary:
          "bg-white !text-[var(--phact-navy)] border border-[var(--phact-border)] hover:bg-slate-50",
      },
      size: {
        default: "h-11 px-5 py-2",
        sm: "h-9 rounded-md px-3 text-xs",
        lg: "h-12 rounded-md px-8 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
