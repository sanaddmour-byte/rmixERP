import * as React from "react";
import {
  useGetCubeTestTraceability,
  useListAllCubeTestSets,
  useListBranches,
  type ListAllCubeTestSetsResult,
} from "@rmixerp/contract";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@rmixerp/ui";
import { NotificationsPanel } from "../components/NotificationsPanel";

function CubeTestDetail({ id }: { id: string }) {
  const detail = useGetCubeTestTraceability(id);
  const d = detail.data?.status === 200 ? detail.data.data : undefined;
  if (detail.isLoading) return <p className="text-sm text-navy-400">Loading…</p>;
  if (!d) return <p className="text-sm text-navy-400">Not found.</p>;

  return (
    <div className="space-y-2 rounded-md border border-navy-200 bg-navy-50 dark:border-navy-700 dark:bg-navy-800 p-3 text-sm">
      <p>
        Batch #{d.batchNumber} — Mix design: {d.mixDesignName} — Age {d.ageDays}d (design age {d.designAgeDays}d)
      </p>
      <p>
        Average: {d.averageStrengthMpa} MPa — Verdict: {d.pass === null ? "pending" : d.pass ? "PASS" : "FAIL"}
      </p>
      <div>
        <p className="font-medium text-navy-700 dark:text-navy-300">Specimens</p>
        {d.specimens.map((s) => (
          <span key={s.id} className="me-3 inline-block">
            #{s.specimenNumber}: {s.strengthMpa} MPa
          </span>
        ))}
      </div>
      {d.notes && <p className="text-navy-600 dark:text-navy-300">Notes: {d.notes}</p>}
      <p className="text-xs text-navy-400">
        Delivery-order traceability isn't available yet — Phase 5 will link this batch's cube results to the
        deliveries drawn from it.
      </p>
    </div>
  );
}

export function QCPage() {
  const [page, setPage] = React.useState(1);
  const [result, setResult] = React.useState<ListAllCubeTestSetsResult | "">("");
  const [branchId, setBranchId] = React.useState("");
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  const branches = useListBranches({ page: 1, pageSize: 100 });
  const branchOptions =
    branches.data?.status === 200 && typeof branches.data.data !== "string" ? branches.data.data.items : [];

  const list = useListAllCubeTestSets({ page, pageSize: 20, ...(result && { result }), ...(branchId && { branchId }) });
  const body = list.data?.status === 200 ? list.data.data : undefined;
  const totalPages = Math.max(1, Math.ceil((body?.total ?? 0) / 20));

  return (
    <div className="space-y-4">
      <NotificationsPanel />

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle>Cube Test Traceability</CardTitle>
          <div className="flex gap-2">
            <select
              className="h-9 rounded-md border border-navy-300 bg-white px-2 text-sm dark:border-navy-700 dark:bg-navy-900 dark:text-navy-100"
              value={result}
              onChange={(e) => {
                setResult(e.target.value as ListAllCubeTestSetsResult | "");
                setPage(1);
              }}
            >
              <option value="">All results</option>
              <option value="pass">Pass</option>
              <option value="fail">Fail</option>
              <option value="pending">Pending</option>
            </select>
            <select
              className="h-9 rounded-md border border-navy-300 bg-white px-2 text-sm dark:border-navy-700 dark:bg-navy-900 dark:text-navy-100"
              value={branchId}
              onChange={(e) => {
                setBranchId(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All branches</option>
              {branchOptions.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-navy-200 text-left text-navy-500 dark:border-navy-800 dark:text-navy-400">
                <th className="py-2 pe-4 font-medium">Batch #</th>
                <th className="py-2 pe-4 font-medium">Mix Design</th>
                <th className="py-2 pe-4 font-medium">Age</th>
                <th className="py-2 pe-4 font-medium">Average MPa</th>
                <th className="py-2 pe-4 font-medium">Result</th>
              </tr>
            </thead>
            <tbody>
              {list.isLoading && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-navy-400 dark:text-navy-500">
                    Loading…
                  </td>
                </tr>
              )}
              {!list.isLoading && (body?.items.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-navy-400 dark:text-navy-500">
                    No records yet.
                  </td>
                </tr>
              )}
              {body?.items.map((item) => (
                <React.Fragment key={item.id}>
                  <tr
                    className="cursor-pointer border-b border-navy-100 dark:border-navy-800 hover:bg-navy-50 dark:hover:bg-navy-800"
                    onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                  >
                    <td className="py-2 pe-4">{item.batchNumber}</td>
                    <td className="py-2 pe-4">{item.mixDesignName}</td>
                    <td className="py-2 pe-4">{item.ageDays}d</td>
                    <td className="py-2 pe-4">{item.averageStrengthMpa}</td>
                    <td className="py-2 pe-4">
                      <span
                        className={
                          item.pass === false
                            ? "rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800"
                            : item.pass === true
                              ? "rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800"
                              : "rounded-full bg-navy-100 px-2 py-0.5 text-xs font-medium text-navy-600 dark:text-navy-300"
                        }
                      >
                        {item.pass === null ? "Pending" : item.pass ? "Pass" : "Fail"}
                      </span>
                    </td>
                  </tr>
                  {expandedId === item.id && (
                    <tr>
                      <td colSpan={5} className="pb-3">
                        <CubeTestDetail id={item.id} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between text-sm text-navy-500 dark:text-navy-400">
            <span>
              Page {page} of {totalPages} ({body?.total ?? 0} total)
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
