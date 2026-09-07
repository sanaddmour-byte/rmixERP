import * as React from "react";
import {
  useCreateUser,
  useListBranches,
  useListRoles,
  useListUsers,
  useUpdateUser,
  useVoidUser,
  type User,
} from "@rmixerp/contract";
import { ResourceListPage, type FieldConfig, type FormValues } from "../components/ResourceListPage";
import { refetchOnSuccess } from "../lib/refetchOnSuccess";
import { useModulePermissions } from "../lib/usePermissions";

export function UsersPage() {
  const [page, setPage] = React.useState(1);
  const [q, setQ] = React.useState("");
  const permissions = useModulePermissions("users");

  const branches = useListBranches({ page: 1, pageSize: 100 });
  const branchOptions =
    branches.data?.status === 200 && typeof branches.data.data !== "string"
      ? branches.data.data.items.map((b) => ({ value: b.id, label: b.name }))
      : [];

  const roles = useListRoles({ page: 1, pageSize: 100 });
  const roleOptions = roles.data?.status === 200 ? roles.data.data.items.map((r) => ({ value: r.id, label: r.name })) : [];

  const createFields: FieldConfig[] = [
    { name: "email", label: "Email", type: "text", required: true },
    { name: "displayName", label: "Display Name", type: "text", required: true },
    { name: "password", label: "Password", type: "text", required: true },
    { name: "branchId", label: "Branch", type: "select", options: branchOptions },
    { name: "roleIds", label: "Roles", type: "multiselect", options: roleOptions },
  ];
  const editFields: FieldConfig[] = [
    { name: "displayName", label: "Display Name", type: "text", required: true },
    { name: "branchId", label: "Branch", type: "select", options: branchOptions },
    { name: "isActive", label: "Active", type: "checkbox" },
    { name: "roleIds", label: "Roles", type: "multiselect", options: roleOptions },
  ];

  const list = useListUsers({ page, pageSize: 20, ...(q && { q }) });
  const create = useCreateUser(refetchOnSuccess(list));
  const update = useUpdateUser(refetchOnSuccess(list));
  const voidMutation = useVoidUser(refetchOnSuccess(list));

  const body = list.data?.status === 200 && typeof list.data.data !== "string" ? list.data.data : undefined;

  return (
    <ResourceListPage<User>
      title="Users"
      columns={[
        { key: "displayName", header: "Name" },
        { key: "email", header: "Email" },
        { key: "isActive", header: "Active" },
        { key: "roleIds", header: "Roles", render: (row) => row.roleIds.length },
      ]}
      items={body?.items ?? []}
      total={body?.total ?? 0}
      page={page}
      pageSize={20}
      isLoading={list.isLoading}
      onPageChange={setPage}
      onSearch={setQ}
      createFields={createFields}
      onCreate={(values: FormValues) =>
        create.mutate({
          data: {
            email: String(values.email ?? ""),
            displayName: String(values.displayName ?? ""),
            password: String(values.password ?? ""),
            ...(values.branchId && { branchId: String(values.branchId) }),
            roleIds: Array.isArray(values.roleIds) ? values.roleIds : [],
          },
        })
      }
      creating={create.isPending}
      editFields={editFields}
      onUpdate={(id, values: FormValues) =>
        update.mutate({
          id,
          data: {
            displayName: String(values.displayName ?? ""),
            ...(values.branchId && { branchId: String(values.branchId) }),
            isActive: Boolean(values.isActive),
            roleIds: Array.isArray(values.roleIds) ? values.roleIds : [],
          },
        })
      }
      updating={update.isPending}
      onVoid={(id) => voidMutation.mutate({ id, data: {} })}
      voiding={voidMutation.isPending}
      permissions={permissions}
    />
  );
}
