/** A loading placeholder for a table body — avoids a layout-shifting "Loading…" row. */
export function TableSkeleton({ columns, rows = 5 }: { columns: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <tr key={r} className="border-b border-gray-100 dark:border-navy-800">
          {Array.from({ length: columns }, (_, c) => (
            <td key={c} className="py-2 pe-4">
              <div className="h-4 w-full max-w-32 animate-pulse rounded bg-gray-200 dark:bg-navy-800" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
