import * as React from "react";
import { ActivityIndicator, FlatList, Text, View } from "react-native";
import { Stack, useFocusEffect } from "expo-router";
import { Button } from "../../src/components/Button";
import { useRequireAuth } from "../../src/lib/useRequireAuth";
import { discardItem, listQueue, retryAllPending, retryItem, type SyncQueueItem } from "../../src/lib/syncQueue";
import { useIsSyncing } from "../../src/lib/useIsSyncing";
import { colors } from "../../src/theme";

/** The four states the review asked for, reflecting actual state: "Synced" never appears here since a synced item leaves the queue entirely (see the delivery screen for that one). */
const STATUS_LABEL: Record<SyncQueueItem["status"], string> = {
  pending: "Saved offline",
  failed: "Needs attention",
  conflict: "Needs attention",
};

const STATUS_COLOR: Record<SyncQueueItem["status"], string> = {
  pending: colors.textMuted,
  failed: colors.danger,
  conflict: colors.danger,
};

function QueueRow({ item, onChanged }: { item: SyncQueueItem; onChanged: () => void }) {
  const [busy, setBusy] = React.useState(false);
  const syncing = useIsSyncing(item.id);

  async function handleRetry() {
    setBusy(true);
    await retryItem(item.id);
    setBusy(false);
    onChanged();
  }

  async function handleDiscard() {
    await discardItem(item.id);
    onChanged();
  }

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 8,
        padding: 12,
        marginBottom: 10,
        gap: 6,
      }}
    >
      <Text style={{ fontWeight: "600", color: colors.navy }}>Proof of Delivery — {item.payload.deliveryOrderId}</Text>
      <Text style={{ color: syncing ? colors.navy : STATUS_COLOR[item.status], fontSize: 13 }}>
        {syncing ? "Syncing…" : STATUS_LABEL[item.status]}
      </Text>
      <Text style={{ color: colors.textMuted, fontSize: 12 }}>
        Queued {new Date(item.createdAt).toLocaleString()} · {item.attempts} attempt{item.attempts === 1 ? "" : "s"}
      </Text>
      {item.lastError && <Text style={{ color: colors.textMuted, fontSize: 12 }}>{item.lastError}</Text>}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Button label={busy || syncing ? "…" : "Retry now"} variant="outline" onPress={() => void handleRetry()} disabled={busy || syncing} />
        {item.status === "conflict" && <Button label="Discard" variant="outline" onPress={() => void handleDiscard()} />}
      </View>
    </View>
  );
}

/**
 * Offline sync queue (PLAN.md Phase 10e): every field mutation that failed
 * with a genuine transport error and is now saved locally, retried
 * automatically on app-foreground (`useSyncQueueAutoRetry`, mounted in
 * `_layout.tsx`) or manually here. Only proof-of-delivery submission
 * feeds this queue today — see `syncQueue.ts`'s doc comment on why a
 * fuller retrofit is scoped-out follow-up rather than built here.
 */
export default function SyncQueueScreen() {
  const { ready } = useRequireAuth();
  const [items, setItems] = React.useState<SyncQueueItem[] | null>(null);
  const [retryingAll, setRetryingAll] = React.useState(false);

  const refresh = React.useCallback(() => {
    void listQueue().then(setItems);
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      if (ready) refresh();
    }, [ready, refresh]),
  );

  async function handleRetryAll() {
    setRetryingAll(true);
    await retryAllPending();
    setRetryingAll(false);
    refresh();
  }

  return (
    <View style={{ flex: 1, padding: 16, gap: 12 }}>
      <Stack.Screen options={{ title: "Sync Queue" }} />

      {items === null && <ActivityIndicator />}
      {items !== null && items.length === 0 && <Text style={{ color: colors.textMuted }}>Nothing queued — everything is synced.</Text>}
      {items !== null && items.length > 0 && (
        <Button label={retryingAll ? "Retrying…" : "Retry all"} onPress={() => void handleRetryAll()} disabled={retryingAll} />
      )}

      <FlatList data={items ?? []} keyExtractor={(item) => item.id} renderItem={({ item }) => <QueueRow item={item} onChanged={refresh} />} />
    </View>
  );
}
