import * as React from "react";
import { View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useListInvoices } from "@rmixerp/contract";
import { PickerField } from "../../src/components/PickerField";
import { ResourceListScreen } from "../../src/components/ResourceListScreen";
import { useRequireAuth } from "../../src/lib/useRequireAuth";

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "pending_clearance", label: "Pending Clearance" },
  { value: "cleared", label: "Cleared" },
  { value: "issued", label: "Issued" },
  { value: "partially_paid", label: "Partially Paid" },
  { value: "paid", label: "Paid" },
  { value: "rejected", label: "Rejected" },
];

/** Read-only invoice lookup for Sales Reps and Collectors — matches the web Invoices list. */
export default function InvoicesScreen() {
  const router = useRouter();
  const { ready } = useRequireAuth();
  const [page, setPage] = React.useState(1);
  const [status, setStatus] = React.useState("");

  const list = useListInvoices(
    { page, pageSize: 20, ...(status && { status: status as "draft" | "pending_clearance" | "cleared" | "issued" | "partially_paid" | "paid" | "rejected" }) },
    { query: { enabled: ready } },
  );
  const body = list.data?.status === 200 ? list.data.data : undefined;

  return (
    <View style={{ flex: 1, padding: 16, gap: 12 }}>
      <Stack.Screen options={{ title: "Invoices" }} />
      <PickerField
        label="Status"
        value={status}
        options={STATUS_OPTIONS}
        onChange={(v) => {
          setPage(1);
          setStatus(v);
        }}
      />
      <ResourceListScreen
        items={body?.items ?? []}
        total={body?.total ?? 0}
        page={page}
        pageSize={20}
        isLoading={list.isLoading}
        onPageChange={setPage}
        onPressItem={(item) => router.push(`/invoices/${item.id}`)}
        renderRow={(item) => ({
          title: `${item.invoiceNumber} — ${item.totalJod} JOD`,
          subtitle: `${item.status.replace(/_/g, " ")} — ${new Date(item.invoicedAt).toLocaleDateString()}`,
        })}
      />
    </View>
  );
}
