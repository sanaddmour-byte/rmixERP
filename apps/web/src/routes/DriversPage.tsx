import * as React from "react";
import {
  useCreateDriver,
  useListBranches,
  useListDrivers,
  useListUsers,
  useUpdateDriver,
  useVoidDriver,
  type Driver,
} from "@rmixerp/contract";
import { ResourceListPage, type FieldConfig, type FormValues } from "../components/ResourceListPage";
import { refetchOnSuccess } from "../lib/refetchOnSuccess";
import { useModulePermissions } from "../lib/usePermissions";

export function DriversPage() {
  const [page, setPage] = React.useState(1);
  const [q, setQ] = React.useState("");
  const permissions = useModulePermissions("drivers");

  const branches = useListBranches({ page: 1, pageSize: 100 });
  const branchOptions =
    branches.data?.status === 200 && typeof branches.data.data !== "string" ? branches.data.data.items : [];
  const users = useListUsers({ page: 1, pageSize: 100 });
  const userOptions =
    users.data?.status === 200 && typeof users.data.data !== "string" ? users.data.data.items : [];

  const fields: FieldConfig[] = [
    {
      name: "branchId",
      label: "Branch",
      type: "select",
      required: true,
      options: branchOptions.map((b) => ({ value: b.id, label: b.name })),
    },
    { name: "name", label: "Name", type: "text", required: true },
    { name: "phone", label: "Phone", type: "text" },
    { name: "licenseNumber", label: "License Number", type: "text" },
    { name: "isActive", label: "Active", type: "checkbox" },
    {
      name: "userId",
      label: "Linked login (mobile driver app)",
      type: "select",
      options: userOptions.map((u) => ({ value: u.id, label: u.displayName })),
    },
  ];

  function toRequestBody(values: FormValues) {
    return {
      branchId: String(values.branchId ?? ""),
      name: String(values.name ?? ""),
      ...(values.phone && { phone: String(values.phone) }),
      ...(values.licenseNumber && { licenseNumber: String(values.licenseNumber) }),
      isActive: Boolean(values.isActive),
      userId: values.userId ? String(values.userId) : null,
    };
  }

  const list = useListDrivers({ page, pageSize: 20, ...(q && { q }) });
  const create = useCreateDriver(refetchOnSuccess(list));
  const update = useUpdateDriver(refetchOnSuccess(list));
  const voidMutation = useVoidDriver(refetchOnSuccess(list));

  const body = list.data?.status === 200 ? list.data.data : undefined;

  return (
    <ResourceListPage<Driver>
      title="Drivers"
      columns={[
        { key: "name", header: "Name" },
        { key: "phone", header: "Phone" },
        { key: "licenseNumber", header: "License Number" },
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
