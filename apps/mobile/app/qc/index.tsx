import * as React from "react";
import { ActivityIndicator, FlatList, Text, View } from "react-native";
import { Stack } from "expo-router";
import { useListNotifications, useMarkNotificationRead } from "@rmixerp/contract";
import { Button } from "../../src/components/Button";
import { useRequireAuth } from "../../src/lib/useRequireAuth";
import { colors } from "../../src/theme";

/** QC Technician failure-alert inbox — see this batch fail on-site (DOMAIN.md Invariant 6). */
export default function QCAlertsScreen() {
  const { ready } = useRequireAuth();
  const notifications = useListNotifications({ page: 1, pageSize: 20, unreadOnly: true }, { query: { enabled: ready } });
  const markRead = useMarkNotificationRead();

  const body = notifications.data?.status === 200 ? notifications.data.data : undefined;

  function handleMarkRead(id: string) {
    markRead.mutate({ id }, { onSuccess: () => void notifications.refetch() });
  }

  return (
    <View style={{ flex: 1, padding: 16, gap: 12 }}>
      <Stack.Screen options={{ title: "QC Alerts" }} />

      {notifications.isLoading && <ActivityIndicator />}
      {!notifications.isLoading && (body?.items.length ?? 0) === 0 && (
        <Text style={{ color: colors.textMuted }}>No unread QC alerts.</Text>
      )}

      <FlatList
        data={body?.items ?? []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View
            style={{
              borderWidth: 1,
              borderColor: colors.accent,
              backgroundColor: "#fdecdc",
              borderRadius: 8,
              padding: 12,
              marginBottom: 10,
              gap: 8,
            }}
          >
            <Text style={{ color: colors.navy }}>{item.message}</Text>
            <Text style={{ fontSize: 12, color: colors.textMuted }}>{new Date(item.createdAt).toLocaleString()}</Text>
            <Button label={markRead.isPending ? "…" : "Mark read"} variant="outline" onPress={() => handleMarkRead(item.id)} />
          </View>
        )}
      />
    </View>
  );
}
