import * as React from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import {
  useCancelSalesOrder,
  useConfirmSalesOrder,
  useCreateSalesOrderLine,
  useFulfillSalesOrder,
  useGetSalesOrder,
  useListProducts,
  useVoidSalesOrderLine,
} from "@rmixerp/contract";
import { Button } from "../../src/components/Button";
import { Input } from "../../src/components/Input";
import { PickerField } from "../../src/components/PickerField";
import { useRequireAuth } from "../../src/lib/useRequireAuth";
import { colors } from "../../src/theme";

export default function SalesOrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { ready } = useRequireAuth();

  const detail = useGetSalesOrder(id, { query: { enabled: ready && Boolean(id) } });
  const products = useListProducts({ page: 1, pageSize: 100 }, { query: { enabled: ready } });
  const productOptions =
    products.data?.status === 200 && typeof products.data.data !== "string"
      ? products.data.data.items.map((p) => ({ value: p.id, label: p.name }))
      : [];
  const productsById = new Map(
    products.data?.status === 200 && typeof products.data.data !== "string" ? products.data.data.items.map((p) => [p.id, p.name]) : [],
  );

  const createLine = useCreateSalesOrderLine();
  const voidLine = useVoidSalesOrderLine();
  const confirm = useConfirmSalesOrder();
  const cancel = useCancelSalesOrder();
  const fulfill = useFulfillSalesOrder();

  const [productId, setProductId] = React.useState("");
  const [quantityM3, setQuantityM3] = React.useState("");
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [creditBlock, setCreditBlock] = React.useState<{ exceedsByJod: string; projectedOutstandingJod: string } | null>(null);
  const [overrideReason, setOverrideReason] = React.useState("");

  const o = detail.data?.status === 200 ? detail.data.data : undefined;

  function refetch() {
    void detail.refetch();
  }

  function handleAddLine() {
    setActionError(null);
    if (!productId || !quantityM3) {
      setActionError("Product and quantity are required.");
      return;
    }
    createLine.mutate(
      { salesOrderId: id, data: { productId, quantityM3 } },
      {
        onSuccess: (result) => {
          if (result.status === 201) {
            setProductId("");
            setQuantityM3("");
            refetch();
          } else {
            setActionError("Could not add the line — check the product has a configured price.");
          }
        },
      },
    );
  }

  function handleConfirm() {
    setCreditBlock(null);
    confirm.mutate(
      { id },
      {
        onSuccess: (result) => {
          if (result.status === 409) {
            const details = result.data.error.details as { exceedsByJod: string; projectedOutstandingJod: string };
            setCreditBlock(details);
          } else {
            refetch();
          }
        },
      },
    );
  }

  function handleOverrideConfirm() {
    confirm.mutate(
      { id, data: { override: { reason: overrideReason } } },
      {
        onSuccess: (result) => {
          if (result.status === 200) {
            setCreditBlock(null);
            setOverrideReason("");
            refetch();
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
      <Stack.Screen options={{ title: `Sales Order — ${o.status}` }} />

      <View style={{ flexDirection: "row", gap: 16 }}>
        <Text style={{ color: colors.textMuted }}>Subtotal: {o.subtotalJod}</Text>
        <Text style={{ color: colors.textMuted }}>Tax: {o.taxJod}</Text>
        <Text style={{ fontWeight: "700", color: colors.navy }}>Total: {o.totalJod} JOD</Text>
      </View>

      {o.creditCheckPolicy && (
        <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 6, padding: 10, backgroundColor: "#f7f9fc" }}>
          <Text style={{ fontSize: 12, color: colors.navy }}>
            Credit check: policy {o.creditCheckPolicy}, projected outstanding {o.creditCheckOutstandingJod} JOD
          </Text>
          {Number(o.creditCheckExceedsByJod) > 0 && (
            <Text style={{ fontSize: 12, color: colors.accent }}>Exceeds limit by {o.creditCheckExceedsByJod} JOD</Text>
          )}
          {o.creditOverride && <Text style={{ fontSize: 12, color: colors.textMuted }}>Overridden: {o.creditOverrideReason}</Text>}
        </View>
      )}

      {creditBlock && (
        <View style={{ borderWidth: 1, borderColor: colors.accent, borderRadius: 6, padding: 10, gap: 8 }}>
          <Text style={{ color: colors.accent }}>
            Blocked: exceeds the customer's credit limit by {creditBlock.exceedsByJod} JOD (projected outstanding{" "}
            {creditBlock.projectedOutstandingJod} JOD).
          </Text>
          <Input
            placeholder="Override reason (requires salesOrders:approve)"
            value={overrideReason}
            onChangeText={setOverrideReason}
          />
          <Button
            variant="accent"
            label={confirm.isPending ? "Confirming…" : "Override & Confirm"}
            onPress={handleOverrideConfirm}
            disabled={confirm.isPending || !overrideReason}
          />
        </View>
      )}

      {actionError && <Text style={{ color: colors.danger }}>{actionError}</Text>}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {o.status === "draft" && <Button label="Confirm" onPress={handleConfirm} disabled={confirm.isPending} />}
        {(o.status === "draft" || o.status === "confirmed") && (
          <Button
            variant="outline"
            label="Cancel"
            onPress={() => cancel.mutate({ id, data: {} }, { onSuccess: refetch })}
            disabled={cancel.isPending}
          />
        )}
        {o.status === "confirmed" && (
          <Button label="Mark Fulfilled" onPress={() => fulfill.mutate({ id }, { onSuccess: refetch })} disabled={fulfill.isPending} />
        )}
      </View>

      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 15, fontWeight: "600", color: colors.navy }}>Lines</Text>
        {o.lines.length === 0 && <Text style={{ color: colors.textMuted }}>No lines yet.</Text>}
        {o.lines.map((line) => (
          <View key={line.id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={{ fontWeight: "600" }}>{productsById.get(line.productId) ?? line.productId}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>
              {line.quantityM3} m³ · Net {line.netJod} · Tax {line.taxJod} · Total {line.totalJod} JOD
            </Text>
            {o.status === "draft" && (
              <Text
                onPress={() => voidLine.mutate({ salesOrderId: id, id: line.id, data: {} }, { onSuccess: refetch })}
                style={{ color: colors.danger, fontSize: 12, marginTop: 4 }}
              >
                Remove
              </Text>
            )}
          </View>
        ))}
      </View>

      {o.status === "draft" && (
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 15, fontWeight: "600", color: colors.navy }}>Add line</Text>
          <PickerField label="Product" value={productId} options={productOptions} onChange={setProductId} />
          <View style={{ gap: 4 }}>
            <Text style={{ fontSize: 13, color: colors.textMuted }}>Quantity (m³)</Text>
            <Input value={quantityM3} onChangeText={setQuantityM3} keyboardType="decimal-pad" />
          </View>
          <Button label={createLine.isPending ? "Adding…" : "Add line"} onPress={handleAddLine} disabled={createLine.isPending} />
        </View>
      )}
    </ScrollView>
  );
}
