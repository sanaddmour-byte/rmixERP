import * as React from "react";
import { ActivityIndicator, Alert, ScrollView, Text, View } from "react-native";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useDeliverDeliveryOrder, useGetDeliveryOrder } from "@rmixerp/contract";
import { Button } from "../../src/components/Button";
import { Input } from "../../src/components/Input";
import { SignaturePad, type SignaturePadHandle } from "../../src/components/SignaturePad";
import { useRequireAuth } from "../../src/lib/useRequireAuth";
import { enqueueProofOfDelivery, listQueue, retryItem, type SyncQueueItem } from "../../src/lib/syncQueue";
import { colors } from "../../src/theme";

type SyncBadge = { label: string; color: string; background: string } | null;

/** The four states the brief asks for, derived from the actual queue — not a separate, hand-maintained status. */
function badgeFor(queueItem: SyncQueueItem | undefined, syncing: boolean, justSynced: boolean): SyncBadge {
  if (syncing) return { label: "Syncing…", color: colors.navy, background: "#e5edf8" };
  if (justSynced) return { label: "Synced", color: colors.success, background: colors.successLight };
  if (!queueItem) return null;
  if (queueItem.status === "pending") return { label: "Saved offline", color: colors.navy, background: "#e5edf8" };
  return { label: "Needs attention", color: colors.danger, background: "#fde2e2" };
}

export default function DeliveryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { ready } = useRequireAuth();
  const router = useRouter();

  const detail = useGetDeliveryOrder(id, { query: { enabled: ready && Boolean(id) } });
  const deliver = useDeliverDeliveryOrder();
  const signaturePadRef = React.useRef<SignaturePadHandle>(null);

  const [receivedQuantityM3, setReceivedQuantityM3] = React.useState("");
  const [signedByName, setSignedByName] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [hasSignature, setHasSignature] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [queueItem, setQueueItem] = React.useState<SyncQueueItem | undefined>(undefined);
  const [syncing, setSyncing] = React.useState(false);
  const [justSynced, setJustSynced] = React.useState(false);

  const refreshQueueItem = React.useCallback(async () => {
    const queue = await listQueue();
    setQueueItem(queue.find((i) => i.payload.deliveryOrderId === id));
  }, [id]);

  useFocusEffect(
    React.useCallback(() => {
      void refreshQueueItem();
    }, [refreshQueueItem]),
  );

  async function handleRetryNow() {
    if (!queueItem) return;
    setSyncing(true);
    const outcome = await retryItem(queueItem.id);
    setSyncing(false);
    if (outcome === "synced") {
      setJustSynced(true);
      setQueueItem(undefined);
      void detail.refetch();
    } else {
      await refreshQueueItem();
    }
  }

  const o = detail.data?.status === 200 ? detail.data.data : undefined;

  function handleSubmit() {
    setError(null);
    const signatureData = signaturePadRef.current?.toDataUri();
    if (!receivedQuantityM3 || !signedByName || !signatureData) {
      setError("Received quantity, signed-by name, and a signature are all required.");
      return;
    }
    const data = { receivedQuantityM3, signedByName, signatureData, ...(notes && { notes }) };
    deliver.mutate(
      { id, data },
      {
        onSuccess: (result) => {
          if (result.status === 200) {
            router.back();
          } else {
            setError("Could not record the proof of delivery.");
          }
        },
        onError: () => {
          // A thrown mutation error is, by http-client.ts's own contract, a
          // genuine transport failure (offline/no signal) rather than a
          // rejected request — the field-offline scenario this queue
          // exists for. Save the submission locally instead of losing it;
          // useSyncQueueAutoRetry replays it once connectivity returns.
          void enqueueProofOfDelivery({ deliveryOrderId: id, request: data }).then(() => {
            Alert.alert(
              "Saved offline",
              "No connection right now — this proof of delivery is saved on this device and will sync automatically once you're back online. You can check its status in Sync Queue.",
            );
            router.back();
          });
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

  const badge = badgeFor(queueItem, syncing, justSynced);

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 16 }}>
      <Stack.Screen options={{ title: `Delivery — ${o.status}` }} />

      <View style={{ gap: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ fontSize: 16, fontWeight: "600", color: colors.navy }}>{o.quantityM3} m³</Text>
          {badge && (
            <View style={{ backgroundColor: badge.background, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ color: badge.color, fontSize: 12, fontWeight: "700" }}>{badge.label}</Text>
            </View>
          )}
        </View>
        <Text style={{ color: colors.textMuted }}>Scheduled: {new Date(o.scheduledAt).toLocaleString()}</Text>
        {o.qcFlagged && (
          <Text style={{ color: colors.accent, fontWeight: "600" }}>QC flagged: {o.qcFlagReason}</Text>
        )}
      </View>

      {queueItem && (
        <View style={{ gap: 6, padding: 12, borderRadius: 8, backgroundColor: queueItem.status === "conflict" ? "#fde2e2" : "#e5edf8" }}>
          <Text style={{ fontSize: 13, color: colors.navy }}>
            {queueItem.status === "conflict"
              ? "This proof of delivery could not be synced — the server rejected it (the delivery may have already been recorded another way). Review it from Sync Queue."
              : "This proof of delivery is saved on this device and hasn't synced to the server yet."}
          </Text>
          {queueItem.lastError && <Text style={{ fontSize: 12, color: colors.textMuted }}>{queueItem.lastError}</Text>}
          {queueItem.status !== "conflict" && (
            <Button label={syncing ? "Syncing…" : "Retry now"} onPress={handleRetryNow} disabled={syncing} />
          )}
        </View>
      )}

      {o.status === "dispatched" && !queueItem && (
        <View style={{ gap: 12 }}>
          <Text style={{ fontSize: 15, fontWeight: "600", color: colors.navy }}>Proof of Delivery</Text>
          <View style={{ gap: 4 }}>
            <Text style={{ fontSize: 13, color: colors.textMuted }}>Received quantity (m³)</Text>
            <Input value={receivedQuantityM3} onChangeText={setReceivedQuantityM3} keyboardType="decimal-pad" />
          </View>
          <View style={{ gap: 4 }}>
            <Text style={{ fontSize: 13, color: colors.textMuted }}>Signed by (name)</Text>
            <Input value={signedByName} onChangeText={setSignedByName} />
          </View>
          <View style={{ gap: 4 }}>
            <Text style={{ fontSize: 13, color: colors.textMuted }}>Notes (optional)</Text>
            <Input value={notes} onChangeText={setNotes} />
          </View>
          <View style={{ gap: 4 }}>
            <Text style={{ fontSize: 13, color: colors.textMuted }}>Customer signature</Text>
            <SignaturePad ref={signaturePadRef} onChange={setHasSignature} />
          </View>
          {error && <Text style={{ color: colors.danger }}>{error}</Text>}
          <Button
            label={deliver.isPending ? "Submitting…" : "Submit Proof of Delivery"}
            onPress={handleSubmit}
            disabled={deliver.isPending || !receivedQuantityM3 || !signedByName || !hasSignature}
          />
        </View>
      )}

      {o.status !== "dispatched" && o.proofOfDelivery && (
        <View style={{ gap: 4 }}>
          <Text style={{ fontSize: 15, fontWeight: "600", color: colors.navy }}>Proof of Delivery</Text>
          <Text style={{ color: colors.textMuted }}>Received: {o.proofOfDelivery.receivedQuantityM3} m³</Text>
          <Text style={{ color: colors.textMuted }}>Signed by: {o.proofOfDelivery.signedByName}</Text>
        </View>
      )}
    </ScrollView>
  );
}
