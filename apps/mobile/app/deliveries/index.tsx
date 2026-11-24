import * as React from "react";
import { Text, View } from "react-native";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useListDeliveryOrders, useListDrivers } from "@rmixerp/contract";
import { ResourceListScreen } from "../../src/components/ResourceListScreen";
import { useCurrentUser } from "../../src/lib/useCurrentUser";
import { useRequireAuth } from "../../src/lib/useRequireAuth";
import { listQueue, type SyncQueueItem } from "../../src/lib/syncQueue";
import { colors } from "../../src/theme";

/** "Which delivery, if any, has a not-yet-synced local proof-of-delivery" — so the list itself can surface it (the review's "next stop/action easy to find"), not just the delivery's own screen. */
function useQueuedByDeliveryId(): Map<string, SyncQueueItem> {
  const [byDeliveryId, setByDeliveryId] = React.useState<Map<string, SyncQueueItem>>(new Map());
  useFocusEffect(
    React.useCallback(() => {
      void listQueue().then((items) => setByDeliveryId(new Map(items.map((i) => [i.payload.deliveryOrderId, i]))));
    }, []),
  );
  return byDeliveryId;
}

const QUEUE_BADGE: Record<SyncQueueItem["status"], string> = {
  pending: "Saved offline",
  failed: "Needs attention",
  conflict: "Needs attention",
};

/** QC-flag-aware "my assigned deliveries" list for the signed-in driver (Phase 5's mobile-critical screen). */
export default function MyDeliveriesScreen() {
  const router = useRouter();
  const { ready } = useRequireAuth();
  const [page, setPage] = React.useState(1);
  const { data: currentUser } = useCurrentUser();
  const myUserId = currentUser?.status === 200 ? currentUser.data.id : undefined;
  const queuedByDeliveryId = useQueuedByDeliveryId();

  const drivers = useListDrivers({ page: 1, pageSize: 100 }, { query: { enabled: ready && Boolean(myUserId) } });
  const myDriver = (drivers.data?.status === 200 ? drivers.data.data.items : []).find((d) => d.userId === myUserId);

  const list = useListDeliveryOrders(
    { page, pageSize: 20, ...(myDriver && { driverId: myDriver.id }), status: "dispatched" },
    { query: { enabled: ready && Boolean(myDriver) } },
  );
  const body = list.data?.status === 200 ? list.data.data : undefined;

  if (ready && drivers.data && !myDriver) {
    return (
      <View style={{ flex: 1, padding: 24, justifyContent: "center" }}>
        <Stack.Screen options={{ title: "My Deliveries" }} />
        <Text style={{ color: colors.textMuted, textAlign: "center" }}>
          No driver profile is linked to your account yet. Ask your dispatcher to link one from the Drivers screen.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: "My Deliveries" }} />
      <ResourceListScreen
        items={body?.items ?? []}
        total={body?.total ?? 0}
        page={page}
        pageSize={20}
        isLoading={list.isLoading}
        onPageChange={setPage}
        onPressItem={(item) => router.push(`/deliveries/${item.id}`)}
        renderRow={(item) => {
          const queued = queuedByDeliveryId.get(item.id);
          const parts = [queued && QUEUE_BADGE[queued.status], item.qcFlagged && `QC flagged: ${item.qcFlagReason ?? ""}`].filter(
            (p): p is string => Boolean(p),
          );
          return {
            title: `${item.quantityM3} m³ — ${new Date(item.scheduledAt).toLocaleString()}`,
            subtitle: parts.length > 0 ? parts.join(" · ") : undefined,
          };
        }}
      />
    </View>
  );
}
