import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./cn";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
  {
    variants: {
      variant: {
        default: "bg-navy-900 text-white hover:bg-navy-800 focus-visible:ring-navy-900 dark:bg-navy-700 dark:hover:bg-navy-600",
        outline:
          "border border-navy-300 bg-white hover:bg-navy-50 focus-visible:ring-navy-400 dark:border-navy-700 dark:bg-navy-900 dark:text-navy-100 dark:hover:bg-navy-800",
        ghost: "hover:bg-navy-50 focus-visible:ring-navy-400 dark:text-navy-100 dark:hover:bg-navy-800",
        accent: "bg-orange-500 text-white hover:bg-orange-600 focus-visible:ring-orange-500",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-12 px-6",
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
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = "Button";
