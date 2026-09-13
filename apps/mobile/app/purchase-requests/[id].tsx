import * as React from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  useApprovePurchaseRequest,
  useCancelPurchaseRequest,
  useCreatePurchaseRequestLine,
  useGetPurchaseRequest,
  useListRawMaterials,
  useRejectPurchaseRequest,
  useSubmitPurchaseRequest,
} from "@rmixerp/contract";
import { Button } from "../../src/components/Button";
import { Input } from "../../src/components/Input";
import { PickerField } from "../../src/components/PickerField";
import { useRequireAuth } from "../../src/lib/useRequireAuth";
import { useModulePermissions } from "../../src/lib/usePermissions";
import { colors } from "../../src/theme";

export default function PurchaseRequestDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { ready } = useRequireAuth();
  const router = useRouter();
  const permissions = useModulePermissions("purchaseRequests");

  const detail = useGetPurchaseRequest(id, { query: { enabled: ready && Boolean(id) } });
  const rawMaterials = useListRawMaterials({ page: 1, pageSize: 100 }, { query: { enabled: ready } });
  const rawMaterialOptions =
    rawMaterials.data?.status === 200 && typeof rawMaterials.data.data !== "string"
      ? rawMaterials.data.data.items.map((r) => ({ value: r.id, label: `${r.name} (${r.unit})` }))
      : [];
  const rawMaterialsById = new Map(
    rawMaterials.data?.status === 200 && typeof rawMaterials.data.data !== "string" ? rawMaterials.data.data.items.map((r) => [r.id, r.name]) : [],
  );

  const createLine = useCreatePurchaseRequestLine();
  const submit = useSubmitPurchaseRequest();
  const approve = useApprovePurchaseRequest();
  const reject = useRejectPurchaseRequest();
  const cancel = useCancelPurchaseRequest();

  const [rawMaterialId, setRawMaterialId] = React.useState("");
  const [quantity, setQuantity] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [actionError, setActionError] = React.useState<string | null>(null);

  const p = detail.data?.status === 200 ? detail.data.data : undefined;

  function refetch() {
    void detail.refetch();
  }

  function handleAddLine() {
    setActionError(null);
    if (!rawMaterialId || !quantity) {
      setActionError("Raw material and quantity are required.");
      return;
    }
    createLine.mutate(
      { id, data: { rawMaterialId, quantity } },
      {
        onSuccess: (result) => {
          if (result.status === 201) {
            setRawMaterialId("");
            setQuantity("");
            refetch();
          } else {
            setActionError("Could not add the line.");
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
  if (!p) {
    return (
      <View style={{ flex: 1, padding: 24 }}>
        <Text style={{ color: colors.textMuted }}>Record not found.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 16 }}>
      <Stack.Screen options={{ title: `${p.requestNumber} — ${p.status}` }} />

      {actionError && <Text style={{ color: colors.danger }}>{actionError}</Text>}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {p.status === "draft" && <Button label="Submit" onPress={() => submit.mutate({ id }, { onSuccess: refetch })} disabled={submit.isPending} />}
        {p.status === "submitted" && permissions.approve && (
          <Button label="Approve" onPress={() => approve.mutate({ id }, { onSuccess: refetch })} disabled={approve.isPending} />
        )}
        {(p.status === "draft" || p.status === "submitted") && (
          <Button
            variant="outline"
            label="Cancel"
            onPress={() => cancel.mutate({ id }, { onSuccess: refetch })}
            disabled={cancel.isPending}
          />
        )}
        {p.status === "approved" && (
          <Button
            variant="accent"
            label="Convert to Purchase Order"
            onPress={() => router.push(`/purchase-orders/new?purchaseRequestId=${id}`)}
          />
        )}
      </View>

      {p.status === "submitted" && permissions.approve && (
        <View style={{ gap: 8 }}>
          <Input placeholder="Rejection reason (optional)" value={reason} onChangeText={setReason} />
          <Button
            variant="outline"
            label="Reject"
            onPress={() => reject.mutate({ id, data: { ...(reason && { reason }) } }, { onSuccess: refetch })}
            disabled={reject.isPending}
          />
        </View>
      )}

      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 15, fontWeight: "600", color: colors.navy }}>Lines</Text>
        {p.lines.length === 0 && <Text style={{ color: colors.textMuted }}>No lines yet.</Text>}
        {p.lines.map((line) => (
          <View key={line.id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={{ fontWeight: "600" }}>{rawMaterialsById.get(line.rawMaterialId) ?? line.rawMaterialId}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>Quantity: {line.quantity}</Text>
          </View>
        ))}
      </View>

      {p.status === "draft" && (
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 15, fontWeight: "600", color: colors.navy }}>Add line</Text>
          <PickerField label="Raw Material" value={rawMaterialId} options={rawMaterialOptions} onChange={setRawMaterialId} />
          <View style={{ gap: 4 }}>
            <Text style={{ fontSize: 13, color: colors.textMuted }}>Quantity</Text>
            <Input value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" />
          </View>
          <Button label={createLine.isPending ? "Adding…" : "Add line"} onPress={handleAddLine} disabled={createLine.isPending} />
        </View>
      )}
    </ScrollView>
  );
}
