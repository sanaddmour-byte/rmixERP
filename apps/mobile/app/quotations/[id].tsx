import * as React from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  useAcceptQuotation,
  useConvertQuotation,
  useCreateQuotationLine,
  useExpireQuotation,
  useGetQuotation,
  useListProducts,
  useRejectQuotation,
  useSendQuotation,
  useVoidQuotationLine,
} from "@rmixerp/contract";
import { Button } from "../../src/components/Button";
import { Input } from "../../src/components/Input";
import { PickerField } from "../../src/components/PickerField";
import { useRequireAuth } from "../../src/lib/useRequireAuth";
import { colors } from "../../src/theme";

export default function QuotationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { ready } = useRequireAuth();

  const detail = useGetQuotation(id, { query: { enabled: ready && Boolean(id) } });
  const products = useListProducts({ page: 1, pageSize: 100 }, { query: { enabled: ready } });
  const productOptions =
    products.data?.status === 200 && typeof products.data.data !== "string"
      ? products.data.data.items.map((p) => ({ value: p.id, label: p.name }))
      : [];
  const productsById = new Map(
    products.data?.status === 200 && typeof products.data.data !== "string" ? products.data.data.items.map((p) => [p.id, p.name]) : [],
  );

  const send = useSendQuotation();
  const accept = useAcceptQuotation();
  const reject = useRejectQuotation();
  const expire = useExpireQuotation();
  const convert = useConvertQuotation();
  const createLine = useCreateQuotationLine();
  const voidLine = useVoidQuotationLine();

  const [productId, setProductId] = React.useState("");
  const [quantityM3, setQuantityM3] = React.useState("");
  const [actionError, setActionError] = React.useState<string | null>(null);

  const q = detail.data?.status === 200 ? detail.data.data : undefined;

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
      { quotationId: id, data: { productId, quantityM3 } },
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

  function handleConvert() {
    convert.mutate(
      { id },
      {
        onSuccess: (result) => {
          if (result.status === 201) router.replace(`/sales-orders/${result.data.id}`);
          else setActionError("Could not convert — the quotation may have no lines.");
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
  if (!q) {
    return (
      <View style={{ flex: 1, padding: 24 }}>
        <Text style={{ color: colors.textMuted }}>Record not found.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 16 }}>
      <Stack.Screen options={{ title: `Quotation — ${q.status}` }} />

      <View style={{ flexDirection: "row", gap: 16 }}>
        <Text style={{ color: colors.textMuted }}>Subtotal: {q.subtotalJod}</Text>
        <Text style={{ color: colors.textMuted }}>Tax: {q.taxJod}</Text>
        <Text style={{ fontWeight: "700", color: colors.navy }}>Total: {q.totalJod} JOD</Text>
      </View>

      {actionError && <Text style={{ color: colors.danger }}>{actionError}</Text>}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {q.status === "draft" && (
          <Button label="Send" onPress={() => send.mutate({ id }, { onSuccess: refetch })} disabled={send.isPending} />
        )}
        {q.status === "sent" && (
          <Button label="Accept" onPress={() => accept.mutate({ id }, { onSuccess: refetch })} disabled={accept.isPending} />
        )}
        {q.status === "sent" && (
          <Button
            variant="outline"
            label="Reject"
            onPress={() => reject.mutate({ id, data: {} }, { onSuccess: refetch })}
            disabled={reject.isPending}
          />
        )}
        {q.status === "sent" && (
          <Button
            variant="outline"
            label="Mark Expired"
            onPress={() => expire.mutate({ id }, { onSuccess: refetch })}
            disabled={expire.isPending}
          />
        )}
        {q.status === "accepted" && (
          <Button variant="accent" label="Convert to Sales Order" onPress={handleConvert} disabled={convert.isPending} />
        )}
      </View>

      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 15, fontWeight: "600", color: colors.navy }}>Lines</Text>
        {q.lines.length === 0 && <Text style={{ color: colors.textMuted }}>No lines yet.</Text>}
        {q.lines.map((line) => (
          <View key={line.id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={{ fontWeight: "600" }}>{productsById.get(line.productId) ?? line.productId}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>
              {line.quantityM3} m³ · Net {line.netJod} · Tax {line.taxJod} · Total {line.totalJod} JOD
            </Text>
            {q.status === "draft" && (
              <Text
                onPress={() => voidLine.mutate({ quotationId: id, id: line.id, data: {} }, { onSuccess: refetch })}
                style={{ color: colors.danger, fontSize: 12, marginTop: 4 }}
              >
                Remove
              </Text>
            )}
          </View>
        ))}
      </View>

      {q.status === "draft" && (
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
