import * as React from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  useApprovePurchaseOrder,
  useCancelPurchaseOrder,
  useCreatePurchaseOrderLine,
  useGetPurchaseOrder,
  useListRawMaterials,
  useRejectPurchaseOrder,
  useSubmitPurchaseOrder,
} from "@rmixerp/contract";
import { Button } from "../../src/components/Button";
import { Input } from "../../src/components/Input";
import { PickerField } from "../../src/components/PickerField";
import { useRequireAuth } from "../../src/lib/useRequireAuth";
import { useModulePermissions } from "../../src/lib/usePermissions";
import { colors } from "../../src/theme";

export default function PurchaseOrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { ready } = useRequireAuth();
  const router = useRouter();
  const permissions = useModulePermissions("purchaseOrders");

  const detail = useGetPurchaseOrder(id, { query: { enabled: ready && Boolean(id) } });
  const rawMaterials = useListRawMaterials({ page: 1, pageSize: 100 }, { query: { enabled: ready } });
  const rawMaterialOptions =
    rawMaterials.data?.status === 200 && typeof rawMaterials.data.data !== "string"
      ? rawMaterials.data.data.items.map((r) => ({ value: r.id, label: `${r.name} (${r.unit})` }))
      : [];
  const rawMaterialsById = new Map(
    rawMaterials.data?.status === 200 && typeof rawMaterials.data.data !== "string" ? rawMaterials.data.data.items.map((r) => [r.id, r.name]) : [],
  );

  const createLine = useCreatePurchaseOrderLine();
  const submit = useSubmitPurchaseOrder();
  const approve = useApprovePurchaseOrder();
  const reject = useRejectPurchaseOrder();
  const cancel = useCancelPurchaseOrder();

  const [rawMaterialId, setRawMaterialId] = React.useState("");
  const [quantity, setQuantity] = React.useState("");
  const [unitPriceJod, setUnitPriceJod] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [actionError, setActionError] = React.useState<string | null>(null);

  const o = detail.data?.status === 200 ? detail.data.data : undefined;

  function refetch() {
    void detail.refetch();
  }

  function handleAddLine() {
    setActionError(null);
    if (!rawMaterialId || !quantity || !unitPriceJod) {
      setActionError("Raw material, quantity, and unit price are required.");
      return;
    }
    createLine.mutate(
      { id, data: { rawMaterialId, quantity, unitPriceJod } },
      {
        onSuccess: (result) => {
          if (result.status === 201) {
            setRawMaterialId("");
            setQuantity("");
            setUnitPriceJod("");
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
  if (!o) {
    return (
      <View style={{ flex: 1, padding: 24 }}>
        <Text style={{ color: colors.textMuted }}>Record not found.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 16 }}>
      <Stack.Screen options={{ title: `${o.poNumber} — ${o.status}` }} />

      <View style={{ flexDirection: "row", gap: 16 }}>
        <Text style={{ color: colors.textMuted }}>Subtotal: {o.subtotalJod}</Text>
        <Text style={{ color: colors.textMuted }}>Tax: {o.taxJod}</Text>
        <Text style={{ fontWeight: "700", color: colors.navy }}>Total: {o.totalJod} JOD</Text>
      </View>

      {actionError && <Text style={{ color: colors.danger }}>{actionError}</Text>}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {o.status === "draft" && <Button label="Submit" onPress={() => submit.mutate({ id }, { onSuccess: refetch })} disabled={submit.isPending} />}
        {o.status === "submitted" && permissions.approve && (
          <Button label="Approve" onPress={() => approve.mutate({ id }, { onSuccess: refetch })} disabled={approve.isPending} />
        )}
        {(o.status === "draft" || o.status === "submitted" || o.status === "approved") && (
          <Button
            variant="outline"
            label="Cancel"
            onPress={() => cancel.mutate({ id }, { onSuccess: refetch })}
            disabled={cancel.isPending}
          />
        )}
        {(o.status === "approved" || o.status === "received") && (
          <Button
            variant="accent"
            label="Receive Goods"
            onPress={() => router.push(`/goods-receipts/new?purchaseOrderId=${id}`)}
          />
        )}
      </View>

      {o.status === "submitted" && permissions.approve && (
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
        {o.lines.length === 0 && <Text style={{ color: colors.textMuted }}>No lines yet.</Text>}
        {o.lines.map((line) => (
          <View key={line.id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={{ fontWeight: "600" }}>{rawMaterialsById.get(line.rawMaterialId) ?? line.rawMaterialId}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>
              {line.quantity} × {line.unitPriceJod} = {line.totalJod} JOD
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>
              Received {line.receivedQuantity} (variance {line.varianceQuantity})
            </Text>
          </View>
        ))}
      </View>

      {o.status === "draft" && (
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 15, fontWeight: "600", color: colors.navy }}>Add line</Text>
          <PickerField label="Raw Material" value={rawMaterialId} options={rawMaterialOptions} onChange={setRawMaterialId} />
          <View style={{ gap: 4 }}>
            <Text style={{ fontSize: 13, color: colors.textMuted }}>Quantity</Text>
            <Input value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" />
          </View>
          <View style={{ gap: 4 }}>
            <Text style={{ fontSize: 13, color: colors.textMuted }}>Unit Price (JOD)</Text>
            <Input value={unitPriceJod} onChangeText={setUnitPriceJod} keyboardType="decimal-pad" />
          </View>
          <Button label={createLine.isPending ? "Adding…" : "Add line"} onPress={handleAddLine} disabled={createLine.isPending} />
        </View>
      )}
    </ScrollView>
  );
}
