import { ActivityIndicator, FlatList, Text, View } from "react-native";
import { Stack } from "expo-router";
import { useGetDocumentExpiryReport } from "@rmixerp/contract";
import { useRequireAuth } from "../../src/lib/useRequireAuth";
import { colors } from "../../src/theme";

const DOCUMENT_LABEL: Record<string, string> = {
  registration: "Registration",
  insurance: "Insurance",
  inspection: "Inspection",
  license: "License",
};

/** Read-only (editing trucks/drivers stays web-only, matching master-data convention) — a dispatcher/plant manager checking fleet compliance on-site. */
export default function FleetAlertsScreen() {
  const { ready } = useRequireAuth();
  const report = useGetDocumentExpiryReport({}, { query: { enabled: ready } });
  const r = report.data?.status === 200 ? report.data.data : undefined;

  return (
    <View style={{ flex: 1, padding: 16, gap: 12 }}>
      <Stack.Screen options={{ title: "Fleet Alerts" }} />
      {r && <Text style={{ fontSize: 12, color: colors.textMuted }}>Warning window: {r.warningDays} days before expiry.</Text>}
      {report.isLoading && <ActivityIndicator />}
      {!report.isLoading && (r?.items.length ?? 0) === 0 && <Text style={{ color: colors.textMuted }}>No documents expired or nearing expiry.</Text>}
      <FlatList
        data={r?.items ?? []}
        keyExtractor={(item, idx) => `${item.entityId}-${item.document}-${idx}`}
        renderItem={({ item }) => (
          <View style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={{ fontSize: 15, fontWeight: "600", color: colors.navy }}>
              {item.label} — {DOCUMENT_LABEL[item.document] ?? item.document}
            </Text>
            <Text style={{ fontSize: 13, color: item.status === "expired" ? colors.danger : colors.accent }}>
              {item.status === "expired" ? "Expired" : "Expiring soon"} — {new Date(item.expiresAt).toLocaleDateString()}
            </Text>
          </View>
        )}
      />
    </View>
  );
}
