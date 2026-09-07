import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useListApprovals, type ApprovalItem } from "@rmixerp/contract";
import { useRequireAuth } from "../../src/lib/useRequireAuth";
import { colors } from "../../src/theme";

const DOCUMENT_LABEL: Record<string, string> = {
  purchase_request: "Purchase Request",
  purchase_order: "Purchase Order",
  vendor_bill: "Vendor Bill",
};

/** Vendor bills stay web-only (Phase 9's mobile scope never shipped a vendor-bill screen), so those rows are informational only — everything else drills into the existing PR/PO detail screens. */
function ApprovalRow({ item }: { item: ApprovalItem }) {
  const router = useRouter();
  const canOpen = item.documentType === "purchase_request" || item.documentType === "purchase_order";

  const content = (
    <View style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <Text style={{ fontSize: 15, fontWeight: "600", color: colors.navy }}>
        {DOCUMENT_LABEL[item.documentType] ?? item.documentType} — {item.number}
      </Text>
      <Text style={{ fontSize: 13, color: colors.textMuted }}>
        {item.amountJod ? `${item.amountJod} JOD — ` : ""}
        {new Date(item.createdAt).toLocaleDateString()}
        {!canOpen && " — open on web to review"}
      </Text>
    </View>
  );

  if (!canOpen) return content;
  const href = item.documentType === "purchase_request" ? `/purchase-requests/${item.id}` : `/purchase-orders/${item.id}`;
  return <Pressable onPress={() => router.push(href)}>{content}</Pressable>;
}

export default function ApprovalsScreen() {
  const { ready } = useRequireAuth();
  const list = useListApprovals({ query: { enabled: ready } });
  const items = list.data?.status === 200 ? list.data.data.items : [];

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Stack.Screen options={{ title: "Approvals" }} />
      {list.isLoading && <ActivityIndicator />}
      {!list.isLoading && items.length === 0 && <Text style={{ color: colors.textMuted }}>Nothing waiting on your approval.</Text>}
      <FlatList data={items} keyExtractor={(item) => `${item.documentType}-${item.id}`} renderItem={({ item }) => <ApprovalRow item={item} />} />
    </View>
  );
}
