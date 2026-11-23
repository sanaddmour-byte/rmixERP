import * as React from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useListDeliveryOrders, useListDrivers, type DeliveryOrder } from "@rmixerp/contract";
import { useCurrentUser } from "../../src/lib/useCurrentUser";
import { useRequireAuth } from "../../src/lib/useRequireAuth";
import { colors } from "../../src/theme";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * The signed-in driver's assigned deliveries (Phase 5's mobile-critical
 * screen), redesigned so the next stop is unmistakable rather than just
 * the top row of a flat, creation-order list (the API orders by
 * createdAt, not scheduledAt — sorted client-side here instead, since a
 * driver's own queue is small enough that this page's one fetch covers
 * it).
 */
export default function MyDeliveriesScreen() {
  const router = useRouter();
  const { ready } = useRequireAuth();
  const { data: currentUser } = useCurrentUser();
  const myUserId = currentUser?.status === 200 ? currentUser.data.id : undefined;

  const drivers = useListDrivers({ page: 1, pageSize: 100 }, { query: { enabled: ready && Boolean(myUserId) } });
  const myDriver = (drivers.data?.status === 200 ? drivers.data.data.items : []).find((d) => d.userId === myUserId);

  const list = useListDeliveryOrders(
    { page: 1, pageSize: 20, ...(myDriver && { driverId: myDriver.id }), status: "dispatched" },
    { query: { enabled: ready && Boolean(myDriver) } },
  );
  const items = list.data?.status === 200 ? list.data.data.items : [];
  const queue = [...items].sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  const [nextStop, ...rest] = queue;

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
    <View style={{ flex: 1, backgroundColor: "#f7f9fc" }}>
      <Stack.Screen options={{ title: "My Deliveries" }} />
      {list.isLoading && (
        <View style={{ padding: 24 }}>
          <Text style={{ color: colors.textMuted }}>Loading…</Text>
        </View>
      )}
      {!list.isLoading && queue.length === 0 && (
        <View style={{ flex: 1, padding: 24, justifyContent: "center" }}>
          <Text style={{ color: colors.textMuted, textAlign: "center" }}>No dispatched deliveries right now.</Text>
        </View>
      )}
      {nextStop && (
        <View style={{ padding: 16 }}>
          <Text style={{ fontSize: 12, fontWeight: "700", color: colors.accent, letterSpacing: 0.5, marginBottom: 6 }}>
            NEXT STOP
          </Text>
          <Pressable
            onPress={() => router.push(`/deliveries/${nextStop.id}`)}
            style={{
              backgroundColor: colors.navy,
              borderRadius: 12,
              padding: 16,
              borderWidth: 2,
              borderColor: colors.accent,
            }}
          >
            <Text style={{ color: "#fff", fontSize: 18, fontWeight: "700" }}>{nextStop.quantityM3} m³</Text>
            <Text style={{ color: "#cdd9ee", fontSize: 14, marginTop: 2 }}>Scheduled {formatTime(nextStop.scheduledAt)}</Text>
            {nextStop.qcFlagged && (
              <Text style={{ color: "#fca5a5", fontSize: 13, marginTop: 4 }}>QC flagged: {nextStop.qcFlagReason ?? ""}</Text>
            )}
            <Text style={{ color: colors.accent, fontSize: 14, fontWeight: "700", marginTop: 10 }}>Record delivery →</Text>
          </Pressable>
        </View>
      )}
      {rest.length > 0 && (
        <>
          <Text style={{ fontSize: 12, fontWeight: "700", color: colors.textMuted, letterSpacing: 0.5, marginHorizontal: 16, marginTop: 4 }}>
            AFTER THIS
          </Text>
          <FlatList
            data={rest}
            keyExtractor={(item: DeliveryOrder) => item.id}
            contentContainerStyle={{ padding: 16, gap: 8 }}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => router.push(`/deliveries/${item.id}`)}
                style={{
                  backgroundColor: "#fff",
                  borderRadius: 8,
                  padding: 12,
                  borderWidth: 1,
                  borderColor: colors.border,
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <View>
                  <Text style={{ fontSize: 15, fontWeight: "600", color: colors.navy }}>{item.quantityM3} m³</Text>
                  <Text style={{ fontSize: 13, color: colors.textMuted }}>
                    {formatTime(item.scheduledAt)}
                    {item.qcFlagged ? ` · QC flagged` : ""}
                  </Text>
                </View>
                <Text style={{ color: colors.accent, fontSize: 13 }}>Details →</Text>
              </Pressable>
            )}
          />
        </>
      )}
    </View>
  );
}
