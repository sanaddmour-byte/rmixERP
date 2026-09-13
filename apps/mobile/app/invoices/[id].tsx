import * as React from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useGetInvoice } from "@rmixerp/contract";
import { useRequireAuth } from "../../src/lib/useRequireAuth";
import { colors } from "../../src/theme";

export default function InvoiceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { ready } = useRequireAuth();

  const detail = useGetInvoice(id, { query: { enabled: ready && Boolean(id) } });
  const inv = detail.data?.status === 200 ? detail.data.data : undefined;

  if (detail.isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }
  if (!inv) {
    return (
      <View style={{ flex: 1, padding: 24 }}>
        <Text style={{ color: colors.textMuted }}>Record not found.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 16 }}>
      <Stack.Screen options={{ title: inv.invoiceNumber }} />

      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 16, fontWeight: "600", color: colors.navy }}>{inv.invoiceNumber}</Text>
        <Text style={{ color: colors.textMuted, textTransform: "capitalize" }}>{inv.status.replace(/_/g, " ")}</Text>
        <Text style={{ color: colors.textMuted }}>{new Date(inv.invoicedAt).toLocaleDateString()}</Text>
      </View>

      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 15, fontWeight: "600", color: colors.navy }}>Lines</Text>
        {inv.lines.map((l) => (
          <View key={l.id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={{ fontWeight: "600" }}>{l.description}</Text>
            <Text style={{ fontSize: 12, color: colors.textMuted, textTransform: "capitalize" }}>{l.taxTreatment}</Text>
            <Text style={{ fontSize: 12, color: colors.textMuted }}>
              Net {l.netJod} + Tax {l.taxJod} = {l.totalJod} JOD
            </Text>
          </View>
        ))}
      </View>

      <View style={{ alignItems: "flex-end", gap: 2 }}>
        <Text style={{ color: colors.textMuted }}>Subtotal: {inv.subtotalJod} JOD</Text>
        <Text style={{ color: colors.textMuted }}>Tax: {inv.taxJod} JOD</Text>
        <Text style={{ fontSize: 16, fontWeight: "600", color: colors.navy }}>Total: {inv.totalJod} JOD</Text>
      </View>

      {inv.creditNotes.length > 0 && (
        <View style={{ gap: 4 }}>
          <Text style={{ fontSize: 15, fontWeight: "600", color: colors.navy }}>Credit Notes</Text>
          {inv.creditNotes.map((n) => (
            <Text key={n.id} style={{ fontSize: 13, color: colors.textMuted }}>
              {n.noteNumber}: {n.totalJod} JOD — {n.reason}
            </Text>
          ))}
        </View>
      )}

      {inv.debitNotes.length > 0 && (
        <View style={{ gap: 4 }}>
          <Text style={{ fontSize: 15, fontWeight: "600", color: colors.navy }}>Debit Notes</Text>
          {inv.debitNotes.map((n) => (
            <Text key={n.id} style={{ fontSize: 13, color: colors.textMuted }}>
              {n.noteNumber}: {n.totalJod} JOD — {n.reason}
            </Text>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
