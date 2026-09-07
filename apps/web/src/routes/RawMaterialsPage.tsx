import * as React from "react";
import {
  useCreateRawMaterial,
  useListRawMaterials,
  useUpdateRawMaterial,
  useVoidRawMaterial,
  type RawMaterial,
} from "@rmixerp/contract";
import { ResourceListPage, type FieldConfig, type FormValues } from "../components/ResourceListPage";
import { refetchOnSuccess } from "../lib/refetchOnSuccess";
import { useModulePermissions } from "../lib/usePermissions";

const FIELDS: FieldConfig[] = [
  { name: "name", label: "Name", type: "text", required: true },
  { name: "code", label: "Code", type: "text", required: true },
  { name: "unit", label: "Unit", type: "text", required: true },
  { name: "category", label: "Category", type: "text" },
];

function toRequestBody(values: FormValues) {
  return {
    name: String(values.name ?? ""),
    code: String(values.code ?? ""),
    unit: String(values.unit ?? ""),
    ...(values.category && { category: String(values.category) }),
  };
}

export function RawMaterialsPage() {
  const [page, setPage] = React.useState(1);
  const [q, setQ] = React.useState("");
  const permissions = useModulePermissions("rawMaterials");

  const list = useListRawMaterials({ page, pageSize: 20, ...(q && { q }) });
  const create = useCreateRawMaterial(refetchOnSuccess(list));
  const update = useUpdateRawMaterial(refetchOnSuccess(list));
  const voidMutation = useVoidRawMaterial(refetchOnSuccess(list));

  const body = list.data?.status === 200 && typeof list.data.data !== "string" ? list.data.data : undefined;

  return (
    <ResourceListPage<RawMaterial>
      title="Raw Materials"
      columns={[
        { key: "name", header: "Name" },
        { key: "code", header: "Code" },
        { key: "unit", header: "Unit" },
        { key: "category", header: "Category" },
      ]}
      items={body?.items ?? []}
      total={body?.total ?? 0}
      page={page}
      pageSize={20}
      isLoading={list.isLoading}
      onPageChange={setPage}
      onSearch={setQ}
      csvUrl={`/api/raw-materials?format=csv${q ? `&q=${encodeURIComponent(q)}` : ""}`}
      createFields={FIELDS}
      onCreate={(values) => create.mutate({ data: toRequestBody(values) })}
      creating={create.isPending}
      editFields={FIELDS}
      onUpdate={(id, values) => update.mutate({ id, data: toRequestBody(values) })}
      updating={update.isPending}
      onVoid={(id) => voidMutation.mutate({ id, data: {} })}
      voiding={voidMutation.isPending}
      permissions={permissions}
    />
  );
}
