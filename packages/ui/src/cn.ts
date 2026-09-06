import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** shadcn/ui's standard class-combining helper — every component here uses it. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
