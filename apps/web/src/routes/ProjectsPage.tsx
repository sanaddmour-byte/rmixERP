import * as React from "react";
import {
  useCreateProject,
  useListCustomers,
  useListProjects,
  useUpdateProject,
  useVoidProject,
  type Project,
} from "@rmixerp/contract";
import { ResourceListPage, type FieldConfig, type FormValues } from "../components/ResourceListPage";
import { refetchOnSuccess } from "../lib/refetchOnSuccess";
import { useModulePermissions } from "../lib/usePermissions";

function toRequestBody(values: FormValues) {
  return {
    customerId: String(values.customerId ?? ""),
    name: String(values.name ?? ""),
    ...(values.address && { address: String(values.address) }),
  };
}

export function ProjectsPage() {
  const [page, setPage] = React.useState(1);
  const [q, setQ] = React.useState("");
  const permissions = useModulePermissions("projects");

  const customers = useListCustomers({ page: 1, pageSize: 100 });
  const customerOptions =
    customers.data?.status === 200 && typeof customers.data.data !== "string"
      ? customers.data.data.items.map((c) => ({ value: c.id, label: c.name }))
      : [];

  const fields: FieldConfig[] = [
    { name: "customerId", label: "Customer", type: "select", options: customerOptions, required: true },
    { name: "name", label: "Name", type: "text", required: true },
    { name: "address", label: "Address", type: "text" },
  ];

  const list = useListProjects({ page, pageSize: 20, ...(q && { q }) });
  const create = useCreateProject(refetchOnSuccess(list));
  const update = useUpdateProject(refetchOnSuccess(list));
  const voidMutation = useVoidProject(refetchOnSuccess(list));

  const body = list.data?.status === 200 && typeof list.data.data !== "string" ? list.data.data : undefined;

  return (
    <ResourceListPage<Project>
      title="Projects"
      columns={[
        { key: "name", header: "Name" },
        { key: "customerId", header: "Customer ID" },
        { key: "address", header: "Address" },
      ]}
      items={body?.items ?? []}
      total={body?.total ?? 0}
      page={page}
      pageSize={20}
      isLoading={list.isLoading}
      onPageChange={setPage}
      onSearch={setQ}
      csvUrl={`/api/projects?format=csv${q ? `&q=${encodeURIComponent(q)}` : ""}`}
      createFields={fields}
      onCreate={(values) => create.mutate({ data: toRequestBody(values) })}
      creating={create.isPending}
      editFields={fields.filter((f) => f.name !== "customerId")}
      onUpdate={(id, values) => update.mutate({ id, data: toRequestBody(values) })}
      updating={update.isPending}
      onVoid={(id) => voidMutation.mutate({ id, data: {} })}
      voiding={voidMutation.isPending}
      permissions={permissions}
    />
  );
}
