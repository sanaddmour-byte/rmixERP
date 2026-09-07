import * as React from "react";
import {
  useCreateCustomer,
  useListCustomers,
  useUpdateCustomer,
  useVoidCustomer,
  type Customer,
} from "@rmixerp/contract";
import { ResourceListPage, type FieldConfig, type FormValues } from "../components/ResourceListPage";
import { refetchOnSuccess } from "../lib/refetchOnSuccess";
import { useModulePermissions } from "../lib/usePermissions";

const FIELDS: FieldConfig[] = [
  { name: "name", label: "Name", type: "text", required: true },
  {
    name: "customerType",
    label: "Type",
    type: "select",
    options: [
      { value: "company", label: "Company" },
      { value: "individual", label: "Individual" },
    ],
  },
  { name: "phone", label: "Phone", type: "text" },
  { name: "email", label: "Email", type: "text" },
  { name: "creditLimitJod", label: "Credit Limit (JOD)", type: "text" },
  {
    name: "creditPolicy",
    label: "Credit Policy",
    type: "select",
    options: [
      { value: "none", label: "None" },
      { value: "warning", label: "Warning" },
      { value: "block", label: "Block" },
    ],
  },
];

function toRequestBody(values: FormValues) {
  const customerType = values.customerType ? (String(values.customerType) as "company" | "individual") : undefined;
  const creditPolicy = values.creditPolicy
    ? (String(values.creditPolicy) as "none" | "warning" | "block")
    : undefined;
  return {
    name: String(values.name ?? ""),
    ...(customerType && { customerType }),
    ...(values.phone && { phone: String(values.phone) }),
    ...(values.email && { email: String(values.email) }),
    ...(values.creditLimitJod && { creditLimitJod: String(values.creditLimitJod) }),
    ...(creditPolicy && { creditPolicy }),
  };
}

export function CustomersPage() {
  const [page, setPage] = React.useState(1);
  const [q, setQ] = React.useState("");
  const permissions = useModulePermissions("customers");

  const list = useListCustomers({ page, pageSize: 20, ...(q && { q }) });
  const create = useCreateCustomer(refetchOnSuccess(list));
  const update = useUpdateCustomer(refetchOnSuccess(list));
  const voidMutation = useVoidCustomer(refetchOnSuccess(list));

  const body = list.data?.status === 200 && typeof list.data.data !== "string" ? list.data.data : undefined;

  return (
    <ResourceListPage<Customer>
      title="Customers"
      columns={[
        { key: "name", header: "Name" },
        { key: "customerType", header: "Type" },
        { key: "phone", header: "Phone" },
        { key: "creditLimitJod", header: "Credit Limit (JOD)" },
        { key: "creditPolicy", header: "Credit Policy" },
      ]}
      items={body?.items ?? []}
      total={body?.total ?? 0}
      page={page}
      pageSize={20}
      isLoading={list.isLoading}
      onPageChange={setPage}
      onSearch={setQ}
      csvUrl={`/api/customers?format=csv${q ? `&q=${encodeURIComponent(q)}` : ""}`}
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
