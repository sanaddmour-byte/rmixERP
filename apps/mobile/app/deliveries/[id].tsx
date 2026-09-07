import * as React from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useDeliverDeliveryOrder, useGetDeliveryOrder } from "@rmixerp/contract";
import { Button } from "../../src/components/Button";
import { Input } from "../../src/components/Input";
import { SignaturePad, type SignaturePadHandle } from "../../src/components/SignaturePad";
import { useRequireAuth } from "../../src/lib/useRequireAuth";
import { colors } from "../../src/theme";

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

  const o = detail.data?.status === 200 ? detail.data.data : undefined;

  function handleSubmit() {
    setError(null);
    const signatureData = signaturePadRef.current?.toDataUri();
    if (!receivedQuantityM3 || !signedByName || !signatureData) {
      setError("Received quantity, signed-by name, and a signature are all required.");
      return;
    }
    deliver.mutate(
      { id, data: { receivedQuantityM3, signedByName, signatureData, ...(notes && { notes }) } },
      {
        onSuccess: (result) => {
          if (result.status === 200) {
            router.back();
          } else {
            setError("Could not record the proof of delivery.");
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
        {o.qcFlagged && (
          <Text style={{ color: colors.accent, fontWeight: "600" }}>QC flagged: {o.qcFlagReason}</Text>
        )}
      </View>

      {o.status === "dispatched" && (
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
