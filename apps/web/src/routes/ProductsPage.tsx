import * as React from "react";
import { useCreateProduct, useListProducts, useUpdateProduct, useVoidProduct, type Product } from "@rmixerp/contract";
import { ResourceListPage, type FieldConfig, type FormValues } from "../components/ResourceListPage";
import { refetchOnSuccess } from "../lib/refetchOnSuccess";
import { useModulePermissions } from "../lib/usePermissions";

const FIELDS: FieldConfig[] = [
  { name: "name", label: "Name", type: "text", required: true },
  { name: "code", label: "Code", type: "text", required: true },
  { name: "characteristicStrengthMpa", label: "Strength (MPa)", type: "number" },
  { name: "unit", label: "Unit", type: "text" },
  { name: "description", label: "Description", type: "text" },
];

function toRequestBody(values: FormValues) {
  return {
    name: String(values.name ?? ""),
    code: String(values.code ?? ""),
    ...(values.characteristicStrengthMpa !== undefined &&
      values.characteristicStrengthMpa !== "" && {
        characteristicStrengthMpa: Number(values.characteristicStrengthMpa),
      }),
    ...(values.unit && { unit: String(values.unit) }),
    ...(values.description && { description: String(values.description) }),
  };
}

export function ProductsPage() {
  const [page, setPage] = React.useState(1);
  const [q, setQ] = React.useState("");
  const permissions = useModulePermissions("products");

  const list = useListProducts({ page, pageSize: 20, ...(q && { q }) });
  const create = useCreateProduct(refetchOnSuccess(list));
  const update = useUpdateProduct(refetchOnSuccess(list));
  const voidMutation = useVoidProduct(refetchOnSuccess(list));

  const body = list.data?.status === 200 && typeof list.data.data !== "string" ? list.data.data : undefined;

  return (
    <ResourceListPage<Product>
      title="Products"
      columns={[
        { key: "name", header: "Name" },
        { key: "code", header: "Code" },
        { key: "characteristicStrengthMpa", header: "Strength (MPa)" },
        { key: "unit", header: "Unit" },
      ]}
      items={body?.items ?? []}
      total={body?.total ?? 0}
      page={page}
      pageSize={20}
      isLoading={list.isLoading}
      onPageChange={setPage}
      onSearch={setQ}
      csvUrl={`/api/products?format=csv${q ? `&q=${encodeURIComponent(q)}` : ""}`}
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
