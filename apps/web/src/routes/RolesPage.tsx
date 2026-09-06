import * as React from "react";
import {
  useCreateRole,
  useListPermissions,
  useListRoles,
  useUpdateRole,
  useVoidRole,
  type Role,
} from "@rmixerp/contract";
import { ResourceListPage, type FieldConfig, type FormValues } from "../components/ResourceListPage";
import { refetchOnSuccess } from "../lib/refetchOnSuccess";
import { useModulePermissions } from "../lib/usePermissions";

function toRequestBody(values: FormValues) {
  return {
    name: String(values.name ?? ""),
    permissionIds: Array.isArray(values.permissionIds) ? values.permissionIds : [],
  };
}

export function RolesPage() {
  const [page, setPage] = React.useState(1);
  const [q, setQ] = React.useState("");
  const permissions = useModulePermissions("roles");

  const permsList = useListPermissions();
  const permOptions =
    permsList.data?.status === 200
      ? permsList.data.data.map((p) => ({ value: p.id, label: `${p.module}:${p.action}` }))
      : [];

  const fields: FieldConfig[] = [
    { name: "name", label: "Name", type: "text", required: true },
    { name: "permissionIds", label: "Permissions", type: "multiselect", options: permOptions },
  ];

  const list = useListRoles({ page, pageSize: 20, ...(q && { q }) });
  const create = useCreateRole(refetchOnSuccess(list));
  const update = useUpdateRole(refetchOnSuccess(list));
  const voidMutation = useVoidRole(refetchOnSuccess(list));

  const body = list.data?.status === 200 ? list.data.data : undefined;

  return (
    <ResourceListPage<Role>
      title="Roles"
      columns={[
        { key: "name", header: "Name" },
        { key: "permissionIds", header: "Permission Count", render: (row) => row.permissionIds.length },
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
