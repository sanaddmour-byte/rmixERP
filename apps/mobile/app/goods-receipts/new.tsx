import * as React from "react";
import { ActivityIndicator, Image, ScrollView, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useCreateGoodsReceipt, useGetPurchaseOrder, useListRawMaterials } from "@rmixerp/contract";
import { Button } from "../../src/components/Button";
import { Input } from "../../src/components/Input";
import { useRequireAuth } from "../../src/lib/useRequireAuth";
import { colors } from "../../src/theme";

async function pickPhoto(source: "camera" | "library"): Promise<string | null> {
  const permission =
    source === "camera" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return null;

  const result =
    source === "camera"
      ? await ImagePicker.launchCameraAsync({ base64: true, quality: 0.5 })
      : await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.5 });
  if (result.canceled || !result.assets[0]?.base64) return null;
  const asset = result.assets[0];
  const mime = asset.mimeType ?? "image/jpeg";
  return `data:${mime};base64,${asset.base64}`;
}

export default function NewGoodsReceiptScreen() {
  const router = useRouter();
  const { ready } = useRequireAuth();
  const { purchaseOrderId } = useLocalSearchParams<{ purchaseOrderId: string }>();

  const po = useGetPurchaseOrder(purchaseOrderId, { query: { enabled: ready && Boolean(purchaseOrderId) } });
  const rawMaterials = useListRawMaterials({ page: 1, pageSize: 100 }, { query: { enabled: ready } });
  const rawMaterialsById = new Map(
    rawMaterials.data?.status === 200 && typeof rawMaterials.data.data !== "string" ? rawMaterials.data.data.items.map((r) => [r.id, r.name]) : [],
  );

  const create = useCreateGoodsReceipt();

  const o = po.data?.status === 200 ? po.data.data : undefined;
  const [quantities, setQuantities] = React.useState<Record<string, string>>({});
  const [notes, setNotes] = React.useState("");
  const [photos, setPhotos] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  async function handleAddPhoto(source: "camera" | "library") {
    const dataUri = await pickPhoto(source);
    if (dataUri) setPhotos((p) => [...p, dataUri]);
  }

  function handleSubmit() {
    setError(null);
    const lines = Object.entries(quantities)
      .filter(([, qty]) => qty && Number(qty) > 0)
      .map(([purchaseOrderLineId, quantityReceived]) => ({ purchaseOrderLineId, quantityReceived }));
    if (lines.length === 0) {
      setError("Enter a received quantity for at least one line.");
      return;
    }
    create.mutate(
      { data: { purchaseOrderId, ...(notes && { notes }), ...(photos.length > 0 && { photos }), lines } },
      {
        onSuccess: (result) => {
          if (result.status === 201) {
            router.back();
          } else {
            setError("Could not record the receipt — check the quantities.");
          }
        },
        onError: () => setError("Could not record the receipt."),
      },
    );
  }

  if (po.isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }
  if (!o) {
    return (
      <View style={{ flex: 1, padding: 24 }}>
        <Text style={{ color: colors.textMuted }}>Purchase order not found.</Text>
      </View>
    );
  }
  if (o.status !== "approved" && o.status !== "received") {
    return (
      <View style={{ flex: 1, padding: 24 }}>
        <Text style={{ color: colors.textMuted }}>This purchase order isn't approved yet — nothing to receive.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 16 }}>
      <Stack.Screen options={{ title: `Receive — ${o.poNumber}` }} />

      <View style={{ gap: 12 }}>
        {o.lines.map((line) => (
          <View key={line.id} style={{ gap: 4 }}>
            <Text style={{ fontWeight: "600", color: colors.navy }}>{rawMaterialsById.get(line.rawMaterialId) ?? line.rawMaterialId}</Text>
            <Text style={{ fontSize: 12, color: colors.textMuted }}>
              Ordered {line.quantity} · Received so far {line.receivedQuantity}
            </Text>
            <Input
              placeholder="Receive now"
              value={quantities[line.id] ?? ""}
              onChangeText={(v) => setQuantities((q) => ({ ...q, [line.id]: v }))}
              keyboardType="decimal-pad"
            />
          </View>
        ))}
      </View>

      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 13, color: colors.textMuted }}>Notes</Text>
        <Input value={notes} onChangeText={setNotes} />
      </View>

      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 15, fontWeight: "600", color: colors.navy }}>Photos</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {photos.map((uri, idx) => (
            <View key={idx} style={{ position: "relative" }}>
              <Image source={{ uri }} style={{ width: 72, height: 72, borderRadius: 6 }} />
              <Text
                onPress={() => setPhotos((p) => p.filter((_, i) => i !== idx))}
                style={{ position: "absolute", top: -6, right: -6, backgroundColor: colors.danger, color: "#fff", borderRadius: 10, width: 20, height: 20, textAlign: "center", fontSize: 12, lineHeight: 20 }}
              >
                ×
              </Text>
            </View>
          ))}
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Button variant="outline" label="Take Photo" onPress={() => void handleAddPhoto("camera")} />
          <Button variant="outline" label="Choose Photo" onPress={() => void handleAddPhoto("library")} />
        </View>
      </View>

      {error && <Text style={{ color: colors.danger }}>{error}</Text>}
      <Button label={create.isPending ? "Recording…" : "Record Receipt"} onPress={handleSubmit} disabled={create.isPending} />
    </ScrollView>
  );
}
