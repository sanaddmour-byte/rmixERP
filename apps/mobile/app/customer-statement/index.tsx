import * as React from "react";
import { ScrollView, Text, View } from "react-native";
import { Stack } from "expo-router";
import { useGetCustomerStatement, useListCustomers } from "@rmixerp/contract";
import { PickerField } from "../../src/components/PickerField";
import { useRequireAuth } from "../../src/lib/useRequireAuth";
import { colors } from "../../src/theme";

/** Customer statement for Collectors in the field — DOMAIN.md/PLAN.md's mobile-critical Phase 8 screen. */
export default function CustomerStatementScreen() {
  const { ready } = useRequireAuth();
  const customers = useListCustomers({ page: 1, pageSize: 100 }, { query: { enabled: ready } });
  const customerOptions =
    customers.data?.status === 200 && typeof customers.data.data !== "string"
      ? customers.data.data.items.map((c) => ({ value: c.id, label: c.name }))
      : [];

  const [customerId, setCustomerId] = React.useState("");
  const statement = useGetCustomerStatement({ customerId }, { query: { enabled: ready && Boolean(customerId) } });
  const s = statement.data?.status === 200 ? statement.data.data : undefined;

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 16 }}>
      <Stack.Screen options={{ title: "Customer Statement" }} />
      <PickerField label="Customer" value={customerId} options={customerOptions} onChange={setCustomerId} />

      {statement.isLoading && <Text style={{ color: colors.textMuted }}>Loading…</Text>}

      {s && (
        <View style={{ gap: 12 }}>
          {s.lines.length === 0 && <Text style={{ color: colors.textMuted }}>No activity.</Text>}
          {s.lines.map((l, idx) => (
            <View key={idx} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontWeight: "600", color: colors.navy, textTransform: "capitalize" }}>{l.type}</Text>
                <Text style={{ color: colors.textMuted }}>{new Date(l.date).toLocaleDateString()}</Text>
              </View>
              <Text style={{ color: colors.textMuted }}>{l.documentNumber}</Text>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: colors.textMuted }}>
                  {l.debitJod !== "0.000" ? `+${l.debitJod}` : `-${l.creditJod}`} JOD
                </Text>
                <Text style={{ fontWeight: "600", color: colors.navy }}>Balance: {l.runningBalanceJod}</Text>
              </View>
            </View>
          ))}
          <View style={{ paddingTop: 8 }}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: colors.navy }}>Closing balance: {s.closingBalanceJod} JOD</Text>
          </View>
        </View>
      )}
    </ScrollView>
  );
}
