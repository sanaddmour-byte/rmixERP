import * as React from "react";
import {
  useCreateChargeType,
  useListChargeTypes,
  useUpdateChargeType,
  useVoidChargeType,
  type ChargeType,
} from "@rmixerp/contract";
import { ResourceListPage, type FieldConfig, type FormValues } from "../components/ResourceListPage";
import { refetchOnSuccess } from "../lib/refetchOnSuccess";
import { useModulePermissions } from "../lib/usePermissions";

const FIELDS: FieldConfig[] = [
  { name: "name", label: "Name", type: "text", required: true },
  {
    name: "calculationMethod",
    label: "Calculation Method",
    type: "select",
    options: [
      { value: "flat", label: "Flat" },
      { value: "per_unit", label: "Per unit" },
      { value: "percentage", label: "Percentage" },
    ],
  },
  { name: "defaultAmountJod", label: "Default Amount (JOD)", type: "text" },
  { name: "isActive", label: "Active", type: "checkbox" },
];

function toRequestBody(values: FormValues) {
  const calculationMethod = values.calculationMethod
    ? (String(values.calculationMethod) as "flat" | "per_unit" | "percentage")
    : undefined;
  return {
    name: String(values.name ?? ""),
    ...(calculationMethod && { calculationMethod }),
    ...(values.defaultAmountJod && { defaultAmountJod: String(values.defaultAmountJod) }),
    isActive: Boolean(values.isActive),
  };
}

export function ChargeTypesPage() {
  const [page, setPage] = React.useState(1);
  const [q, setQ] = React.useState("");
  const permissions = useModulePermissions("chargeTypes");

  const list = useListChargeTypes({ page, pageSize: 20, ...(q && { q }) });
  const create = useCreateChargeType(refetchOnSuccess(list));
  const update = useUpdateChargeType(refetchOnSuccess(list));
  const voidMutation = useVoidChargeType(refetchOnSuccess(list));

  const body = list.data?.status === 200 && typeof list.data.data !== "string" ? list.data.data : undefined;

  return (
    <ResourceListPage<ChargeType>
      title="Charge Types"
      columns={[
        { key: "name", header: "Name" },
        { key: "calculationMethod", header: "Method" },
        { key: "defaultAmountJod", header: "Default Amount (JOD)" },
        { key: "isActive", header: "Active" },
      ]}
      items={body?.items ?? []}
      total={body?.total ?? 0}
      page={page}
      pageSize={20}
      isLoading={list.isLoading}
      onPageChange={setPage}
      onSearch={setQ}
      csvUrl={`/api/charge-types?format=csv${q ? `&q=${encodeURIComponent(q)}` : ""}`}
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
