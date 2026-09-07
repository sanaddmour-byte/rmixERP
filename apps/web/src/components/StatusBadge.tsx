export type BadgeTone = "green" | "yellow" | "red" | "gray";

const TONE_CLASSES: Record<BadgeTone, string> = {
  green: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  yellow: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  red: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  gray: "bg-navy-100 text-navy-600 dark:bg-navy-800 dark:text-navy-300",
};

/** Small pill for a document/record status, colored red/yellow/green (or gray for terminal neutral states). */
export function StatusBadge({ label, tone }: { label: string; tone: BadgeTone }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${TONE_CLASSES[tone]}`}>
      {label}
    </span>
  );
}
