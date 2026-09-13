import * as React from "react";
import { cn } from "./cn";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "flex h-10 w-full rounded-md border border-navy-300 bg-white px-3 py-2 text-sm placeholder:text-navy-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-navy-700 dark:bg-navy-900 dark:text-navy-100 dark:placeholder:text-navy-500",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";
