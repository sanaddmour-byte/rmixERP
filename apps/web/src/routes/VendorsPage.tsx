import * as React from "react";
import { useCreateVendor, useListVendors, useUpdateVendor, useVoidVendor, type Vendor } from "@rmixerp/contract";
import { ResourceListPage, type FieldConfig, type FormValues } from "../components/ResourceListPage";
import { refetchOnSuccess } from "../lib/refetchOnSuccess";
import { useModulePermissions } from "../lib/usePermissions";

const FIELDS: FieldConfig[] = [
  { name: "name", label: "Name", type: "text", required: true },
  { name: "taxNumber", label: "Tax Number", type: "text" },
  { name: "phone", label: "Phone", type: "text" },
  { name: "email", label: "Email", type: "text" },
  { name: "address", label: "Address", type: "text" },
  { name: "paymentTermsDays", label: "Payment Terms (days)", type: "number" },
];

function toRequestBody(values: FormValues) {
  return {
    name: String(values.name ?? ""),
    ...(values.taxNumber && { taxNumber: String(values.taxNumber) }),
    ...(values.phone && { phone: String(values.phone) }),
    ...(values.email && { email: String(values.email) }),
    ...(values.address && { address: String(values.address) }),
    ...(values.paymentTermsDays !== undefined &&
      values.paymentTermsDays !== "" && { paymentTermsDays: Number(values.paymentTermsDays) }),
  };
}

export function VendorsPage() {
  const [page, setPage] = React.useState(1);
  const [q, setQ] = React.useState("");
  const permissions = useModulePermissions("vendors");

  const list = useListVendors({ page, pageSize: 20, ...(q && { q }) });
  const create = useCreateVendor(refetchOnSuccess(list));
  const update = useUpdateVendor(refetchOnSuccess(list));
  const voidMutation = useVoidVendor(refetchOnSuccess(list));

  const body = list.data?.status === 200 && typeof list.data.data !== "string" ? list.data.data : undefined;

  return (
    <ResourceListPage<Vendor>
      title="Vendors"
      columns={[
        { key: "name", header: "Name" },
        { key: "taxNumber", header: "Tax Number" },
        { key: "phone", header: "Phone" },
        { key: "paymentTermsDays", header: "Payment Terms (days)" },
      ]}
      items={body?.items ?? []}
      total={body?.total ?? 0}
      page={page}
      pageSize={20}
      isLoading={list.isLoading}
      onPageChange={setPage}
      onSearch={setQ}
      csvUrl={`/api/vendors?format=csv${q ? `&q=${encodeURIComponent(q)}` : ""}`}
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
