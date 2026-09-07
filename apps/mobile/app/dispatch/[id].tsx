import * as React from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useDispatchDeliveryOrder, useGetDeliveryOrder, useListDrivers, useListTrucks } from "@rmixerp/contract";
import { Button } from "../../src/components/Button";
import { Input } from "../../src/components/Input";
import { PickerField } from "../../src/components/PickerField";
import { useRequireAuth } from "../../src/lib/useRequireAuth";
import { colors } from "../../src/theme";

export default function DispatchDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { ready } = useRequireAuth();

  const detail = useGetDeliveryOrder(id, { query: { enabled: ready && Boolean(id) } });
  const trucks = useListTrucks({ page: 1, pageSize: 100 }, { query: { enabled: ready } });
  const drivers = useListDrivers({ page: 1, pageSize: 100 }, { query: { enabled: ready } });
  const dispatch = useDispatchDeliveryOrder();

  const truckOptions = (trucks.data?.status === 200 ? trucks.data.data.items : []).map((t) => ({
    value: t.id,
    label: t.plateNumber,
  }));
  const driverOptions = (drivers.data?.status === 200 ? drivers.data.data.items : []).map((d) => ({
    value: d.id,
    label: d.name,
  }));

  const [truckId, setTruckId] = React.useState("");
  const [driverId, setDriverId] = React.useState("");
  const [blocked, setBlocked] = React.useState<{ outstandingJod: string; exceedsByJod: string } | null>(null);
  const [overrideReason, setOverrideReason] = React.useState("");

  const o = detail.data?.status === 200 ? detail.data.data : undefined;

  function submitDispatch(override?: { reason: string }) {
    if (!truckId || !driverId) return;
    dispatch.mutate(
      { id, data: { truckId, driverId, ...(override && { override }) } },
      {
        onSuccess: (result) => {
          if (result.status === 200) {
            setBlocked(null);
            void detail.refetch();
          } else if (result.status === 409) {
            setBlocked(result.data.error.details as { outstandingJod: string; exceedsByJod: string });
          }
        },
      },
    );
  }

  if (detail.isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }
  if (!o) {
    return (
      <View style={{ flex: 1, padding: 24 }}>
        <Text style={{ color: colors.textMuted }}>Record not found.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 16 }}>
      <Stack.Screen options={{ title: `Delivery — ${o.status}` }} />

      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 16, fontWeight: "600", color: colors.navy }}>{o.quantityM3} m³</Text>
        <Text style={{ color: colors.textMuted }}>Scheduled: {new Date(o.scheduledAt).toLocaleString()}</Text>
        {o.qcFlagged && <Text style={{ color: colors.accent, fontWeight: "600" }}>QC flagged: {o.qcFlagReason}</Text>}
      </View>

      {o.status === "planned" && (
        <View style={{ gap: 12 }}>
          <Text style={{ fontSize: 15, fontWeight: "600", color: colors.navy }}>Dispatch</Text>
          <PickerField label="Truck" value={truckId} options={truckOptions} onChange={setTruckId} />
          <PickerField label="Driver" value={driverId} options={driverOptions} onChange={setDriverId} />
          <Button
            label={dispatch.isPending ? "Dispatching…" : "Dispatch"}
            onPress={() => submitDispatch()}
            disabled={dispatch.isPending || !truckId || !driverId}
          />

          {blocked && (
            <View style={{ borderWidth: 1, borderColor: colors.accent, borderRadius: 6, padding: 10, gap: 8 }}>
              <Text style={{ color: colors.accent }}>
                Blocked: customer's outstanding {blocked.outstandingJod} JOD exceeds their limit by {blocked.exceedsByJod} JOD.
              </Text>
              <Input
                placeholder="Override reason (requires deliveryOrders:approve)"
                value={overrideReason}
                onChangeText={setOverrideReason}
              />
              <Button
                variant="accent"
                label={dispatch.isPending ? "…" : "Override & Dispatch"}
                onPress={() => submitDispatch({ reason: overrideReason })}
                disabled={dispatch.isPending || !overrideReason}
              />
            </View>
          )}
        </View>
      )}

      {o.status === "dispatched" && (
        <Text style={{ color: colors.textMuted }}>Awaiting delivery — proof of delivery is captured by the driver.</Text>
      )}

      {o.proofOfDelivery && (
        <View style={{ gap: 4 }}>
          <Text style={{ fontSize: 15, fontWeight: "600", color: colors.navy }}>Proof of Delivery</Text>
          <Text style={{ color: colors.textMuted }}>Received: {o.proofOfDelivery.receivedQuantityM3} m³</Text>
          <Text style={{ color: colors.textMuted }}>Signed by: {o.proofOfDelivery.signedByName}</Text>
        </View>
      )}
    </ScrollView>
  );
}
