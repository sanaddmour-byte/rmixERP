import * as React from "react";
import { useCreateTruck, useListBranches, useListTrucks, useUpdateTruck, useVoidTruck, type Truck } from "@rmixerp/contract";
import { ResourceListPage, type FieldConfig, type FormValues } from "../components/ResourceListPage";
import { refetchOnSuccess } from "../lib/refetchOnSuccess";
import { useModulePermissions } from "../lib/usePermissions";

export function TrucksPage() {
  const [page, setPage] = React.useState(1);
  const [q, setQ] = React.useState("");
  const permissions = useModulePermissions("trucks");

  const branches = useListBranches({ page: 1, pageSize: 100 });
  const branchOptions =
    branches.data?.status === 200 && typeof branches.data.data !== "string" ? branches.data.data.items : [];

  const fields: FieldConfig[] = [
    {
      name: "branchId",
      label: "Branch",
      type: "select",
      required: true,
      options: branchOptions.map((b) => ({ value: b.id, label: b.name })),
    },
    { name: "plateNumber", label: "Plate Number", type: "text", required: true },
    { name: "capacityM3", label: "Capacity (m³)", type: "text" },
    { name: "isActive", label: "Active", type: "checkbox" },
  ];

  function toRequestBody(values: FormValues) {
    return {
      branchId: String(values.branchId ?? ""),
      plateNumber: String(values.plateNumber ?? ""),
      ...(values.capacityM3 && { capacityM3: String(values.capacityM3) }),
      isActive: Boolean(values.isActive),
    };
  }

  const list = useListTrucks({ page, pageSize: 20, ...(q && { q }) });
  const create = useCreateTruck(refetchOnSuccess(list));
  const update = useUpdateTruck(refetchOnSuccess(list));
  const voidMutation = useVoidTruck(refetchOnSuccess(list));

  const body = list.data?.status === 200 ? list.data.data : undefined;

  return (
    <ResourceListPage<Truck>
      title="Trucks"
      columns={[
        { key: "plateNumber", header: "Plate Number" },
        { key: "capacityM3", header: "Capacity (m³)" },
        { key: "isActive", header: "Active", render: (row) => (row.isActive ? "Yes" : "No") },
      ]}
      items={body?.items ?? []}
      total={body?.total ?? 0}
      page={page}
      pageSize={20}
      isLoading={list.isLoading}
      onPageChange={setPage}
      onSearch={setQ}
      createFields={fields}
      onCreate={(values) => create.mutate({ data: toRequestBody(values) })}
      creating={create.isPending}
      editFields={fields}
      onUpdate={(id, values) => update.mutate({ id, data: toRequestBody(values) })}
      updating={update.isPending}
      onVoid={(id) => voidMutation.mutate({ id, data: {} })}
      voiding={voidMutation.isPending}
      permissions={permissions}
    />
  );
}
