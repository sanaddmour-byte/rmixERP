import type { Response } from "express";

export interface CsvColumn<T> {
  key: keyof T;
  header: string;
}

function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  return /[",\n]/.test(str) ? `"${str.replaceAll('"', '""')}"` : str;
}

/** Shared CSV writer for every list endpoint's `?format=csv` export. */
export function sendCsv<T>(
  res: Response,
  filename: string,
  rows: readonly T[],
  columns: readonly CsvColumn<T>[],
): void {
  const lines = [
    columns.map((c) => escapeCsvValue(c.header)).join(","),
    ...rows.map((row) => columns.map((c) => escapeCsvValue(row[c.key])).join(",")),
  ];
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.status(200).send(lines.join("\n"));
}
