import * as React from "react";
import { View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useListDeliveryOrders } from "@rmixerp/contract";
import { PickerField } from "../../src/components/PickerField";
import { ResourceListScreen } from "../../src/components/ResourceListScreen";
import { useRequireAuth } from "../../src/lib/useRequireAuth";

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "planned", label: "Planned" },
  { value: "dispatched", label: "Dispatched" },
  { value: "delivered", label: "Delivered" },
];

/**
 * Mobile dispatcher view — an actionable list + per-delivery dispatch
 * action (see app/dispatch/[id].tsx). The Gantt-style visual schedule
 * stays web-only (a planning tool, not a field action), matching the
 * "web for planning, mobile for execution" split from Phase 3.
 */
export default function DispatchScreen() {
  const router = useRouter();
  const { ready } = useRequireAuth();
  const [page, setPage] = React.useState(1);
  const [status, setStatus] = React.useState("planned");

  const list = useListDeliveryOrders(
    { page, pageSize: 20, ...(status && { status: status as "planned" | "dispatched" | "delivered" | "invoiced" }) },
    { query: { enabled: ready } },
  );
  const body = list.data?.status === 200 ? list.data.data : undefined;

  return (
    <View style={{ flex: 1, padding: 16, gap: 12 }}>
      <Stack.Screen options={{ title: "Dispatch" }} />
      <PickerField label="Status" value={status} options={STATUS_OPTIONS} onChange={setStatus} />
      <ResourceListScreen
        items={body?.items ?? []}
        total={body?.total ?? 0}
        page={page}
        pageSize={20}
        isLoading={list.isLoading}
        onPageChange={setPage}
        onPressItem={(item) => router.push(`/dispatch/${item.id}`)}
        renderRow={(item) => ({
          title: `${item.status.toUpperCase()} — ${item.quantityM3} m³`,
          subtitle: `${new Date(item.scheduledAt).toLocaleString()}${item.qcFlagged ? " — QC flagged" : ""}`,
        })}
      />
    </View>
  );
}
