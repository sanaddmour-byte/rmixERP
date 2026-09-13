import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useListNotifications, useMarkNotificationRead, type Notification } from "@rmixerp/contract";
import { resolveNotificationRoute, NOTIFICATION_TYPES, type NotificationType } from "@rmixerp/core";
import { Button } from "./Button";
import { colors } from "../theme";

function isNotificationType(value: string): value is NotificationType {
  return (NOTIFICATION_TYPES as readonly string[]).includes(value);
}

function hrefFor(n: Notification): string | undefined {
  return isNotificationType(n.type) ? resolveNotificationRoute("mobile", n.type, n.entityId) : undefined;
}

function NotificationRow({ item, onMarkRead, marking }: { item: Notification; onMarkRead: () => void; marking: boolean }) {
  const router = useRouter();
  const href = hrefFor(item);

  const body = (
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
      <Button label={marking ? "…" : "Mark read"} variant="outline" onPress={onMarkRead} />
    </View>
  );

  return href ? <Pressable onPress={() => router.push(href)}>{body}</Pressable> : body;
}

/**
 * Cross-module notification inbox (PLAN.md Phase 10c) shared by the QC
 * Alerts screen and the standalone Notifications screen -- the server
 * already scopes the list to types this user's permissions cover, each row
 * links to its source document via `resolveNotificationRoute`.
 */
export function NotificationsPanel({ ready, emptyLabel = "No unread notifications." }: { ready: boolean; emptyLabel?: string }) {
  const notifications = useListNotifications({ page: 1, pageSize: 20, unreadOnly: true }, { query: { enabled: ready } });
  const markRead = useMarkNotificationRead();
  const body = notifications.data?.status === 200 ? notifications.data.data : undefined;

  function handleMarkRead(id: string) {
    markRead.mutate({ id }, { onSuccess: () => void notifications.refetch() });
  }

  return (
    <View style={{ gap: 12 }}>
      {notifications.isLoading && <ActivityIndicator />}
      {!notifications.isLoading && (body?.items.length ?? 0) === 0 && <Text style={{ color: colors.textMuted }}>{emptyLabel}</Text>}
      <FlatList
        data={body?.items ?? []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <NotificationRow item={item} marking={markRead.isPending} onMarkRead={() => handleMarkRead(item.id)} />
        )}
      />
    </View>
  );
}
