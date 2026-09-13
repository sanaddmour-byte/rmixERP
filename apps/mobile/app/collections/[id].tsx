import * as React from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useGetCollection } from "@rmixerp/contract";
import { useRequireAuth } from "../../src/lib/useRequireAuth";
import { colors } from "../../src/theme";

export default function CollectionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { ready } = useRequireAuth();

  const detail = useGetCollection(id, { query: { enabled: ready && Boolean(id) } });
  const c = detail.data?.status === 200 ? detail.data.data : undefined;

  if (detail.isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }
  if (!c) {
    return (
      <View style={{ flex: 1, padding: 24 }}>
        <Text style={{ color: colors.textMuted }}>Record not found.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 16 }}>
      <Stack.Screen options={{ title: c.receiptNumber }} />

      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 16, fontWeight: "600", color: colors.navy }}>{c.amountJod} JOD</Text>
        <Text style={{ color: colors.textMuted, textTransform: "capitalize" }}>{c.method.replace(/_/g, " ")}</Text>
        <Text style={{ color: colors.textMuted }}>Received {new Date(c.receivedAt).toLocaleDateString()}</Text>
        {c.reference && <Text style={{ color: colors.textMuted }}>Ref: {c.reference}</Text>}
      </View>

      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 15, fontWeight: "600", color: colors.navy }}>Allocations</Text>
        {c.allocations.length === 0 && <Text style={{ color: colors.textMuted }}>None.</Text>}
        {c.allocations.map((a) => (
          <View key={a.id} style={{ paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={{ color: colors.navy, opacity: a.voidedAt ? 0.5 : 1, textDecorationLine: a.voidedAt ? "line-through" : "none" }}>
              {a.amountJod} JOD → invoice {a.invoiceId.slice(0, 8)}…
            </Text>
            {a.voidedAt && <Text style={{ fontSize: 12, color: colors.danger }}>Unwound</Text>}
          </View>
        ))}
      </View>

      {c.postDatedCheque && (
        <View style={{ gap: 4, borderWidth: 1, borderColor: colors.border, borderRadius: 6, padding: 12 }}>
          <Text style={{ fontSize: 15, fontWeight: "600", color: colors.navy }}>Post-dated Cheque</Text>
          <Text style={{ color: colors.textMuted }}>
            {c.postDatedCheque.bankName} #{c.postDatedCheque.chequeNumber}
          </Text>
          <Text style={{ color: colors.textMuted }}>Due {new Date(c.postDatedCheque.dueDate).toLocaleDateString()}</Text>
          <Text style={{ color: colors.textMuted, textTransform: "capitalize" }}>Status: {c.postDatedCheque.status}</Text>
          {c.postDatedCheque.bounceReason && <Text style={{ color: colors.danger }}>Bounced: {c.postDatedCheque.bounceReason}</Text>}
        </View>
      )}
    </ScrollView>
  );
}
