import * as React from "react";
import { ActivityIndicator, Alert, ScrollView, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useDeliverDeliveryOrder, useGetDeliveryOrder } from "@rmixerp/contract";
import { Button } from "../../src/components/Button";
import { Input } from "../../src/components/Input";
import { SignaturePad, type SignaturePadHandle } from "../../src/components/SignaturePad";
import { useRequireAuth } from "../../src/lib/useRequireAuth";
import { enqueueProofOfDelivery, retryItem } from "../../src/lib/syncQueue";
import { useQueuedDelivery } from "../../src/lib/useQueuedDelivery";
import { useIsSyncing } from "../../src/lib/useIsSyncing";
import { colors } from "../../src/theme";

export default function DeliveryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { ready } = useRequireAuth();
  const router = useRouter();

  const detail = useGetDeliveryOrder(id, { query: { enabled: ready && Boolean(id) } });
  const deliver = useDeliverDeliveryOrder();
  const signaturePadRef = React.useRef<SignaturePadHandle>(null);
  const { item: queued, refresh: refreshQueued } = useQueuedDelivery(id);
  const syncing = useIsSyncing(queued?.id);
  const [retrying, setRetrying] = React.useState(false);
  const hadQueuedItem = React.useRef(false);

  const [receivedQuantityM3, setReceivedQuantityM3] = React.useState("");
  const [signedByName, setSignedByName] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [hasSignature, setHasSignature] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const o = detail.data?.status === 200 ? detail.data.data : undefined;

  // A queued item disappearing (without us having just discarded it
  // ourselves) means a background retry just synced it — show the
  // fourth state the review asked for ("Synced") and pull the now-
  // current server record so the proof-of-delivery view below replaces
  // the form, instead of leaving the driver looking at a stale screen.
  React.useEffect(() => {
    if (queued) {
      hadQueuedItem.current = true;
    } else if (hadQueuedItem.current) {
      hadQueuedItem.current = false;
      Alert.alert("Synced", "This proof of delivery has synced successfully.");
      void detail.refetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to `queued` changing, not detail/refetch identity.
  }, [queued]);

  async function handleRetryNow() {
    if (!queued) return;
    setRetrying(true);
    await retryItem(queued.id);
    setRetrying(false);
    refreshQueued();
  }

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
          // Stay on this screen (not router.back()) so its own "Saved
          // offline" banner reflects the real state instead of the driver
          // coming back later to a blank form that invites a duplicate
          // local submission of the same delivery.
          void enqueueProofOfDelivery({ deliveryOrderId: id, request: data }).then(() => {
            refreshQueued();
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

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 16 }}>
      <Stack.Screen options={{ title: `Delivery — ${o.status}` }} />

      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 16, fontWeight: "600", color: colors.navy }}>{o.quantityM3} m³</Text>
        <Text style={{ color: colors.textMuted }}>Scheduled: {new Date(o.scheduledAt).toLocaleString()}</Text>
        {o.qcFlagged && (
          <Text style={{ color: colors.accent, fontWeight: "600" }}>QC flagged: {o.qcFlagReason}</Text>
        )}
      </View>

      {o.status === "dispatched" && queued && (
        <View
          style={{
            borderWidth: 1,
            borderRadius: 8,
            padding: 12,
            gap: 6,
            borderColor: syncing ? colors.navy : queued.status === "pending" ? colors.border : colors.danger,
            backgroundColor: syncing ? colors.navy + "11" : queued.status === "pending" ? colors.border + "22" : colors.danger + "11",
          }}
        >
          <Text style={{ fontWeight: "600", color: syncing ? colors.navy : queued.status === "pending" ? colors.textMuted : colors.danger }}>
            {syncing ? "Syncing…" : queued.status === "pending" ? "Saved offline" : "Needs attention"}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>
            {syncing
              ? "Sending this proof of delivery now…"
              : queued.status === "pending"
                ? "No connection when you submitted — saved on this device and will sync automatically once you're back online."
                : (queued.lastError ?? "Couldn't sync automatically — check Sync Queue for details.")}
          </Text>
          {!syncing && queued.status !== "pending" && (
            <Button label={retrying ? "…" : "Retry now"} variant="outline" onPress={() => void handleRetryNow()} disabled={retrying} />
          )}
        </View>
      )}

      {o.status === "dispatched" && !queued && (
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
