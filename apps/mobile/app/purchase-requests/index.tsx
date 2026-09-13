import * as React from "react";
import { Text, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useListPurchaseRequests } from "@rmixerp/contract";
import { ResourceListScreen } from "../../src/components/ResourceListScreen";
import { useRequireAuth } from "../../src/lib/useRequireAuth";
import { useModulePermissions } from "../../src/lib/usePermissions";
import { colors } from "../../src/theme";

export default function PurchaseRequestsScreen() {
  const router = useRouter();
  const { ready } = useRequireAuth();
  const permissions = useModulePermissions("purchaseRequests");
  const [page, setPage] = React.useState(1);

  const list = useListPurchaseRequests({ page, pageSize: 20 }, { query: { enabled: ready } });
  const body = list.data?.status === 200 ? list.data.data : undefined;

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: "Purchase Requests" }} />
      <ResourceListScreen
        items={body?.items ?? []}
        total={body?.total ?? 0}
        page={page}
        pageSize={20}
        isLoading={list.isLoading}
        onPageChange={setPage}
        onPressItem={(item) => router.push(`/purchase-requests/${item.id}`)}
        renderRow={(item) => ({
          title: `${item.requestNumber} — ${item.status.toUpperCase()}`,
          subtitle: item.neededByDate ? `Needed by ${new Date(item.neededByDate).toLocaleDateString()}` : undefined,
        })}
      />
      {permissions.create && (
        <View style={{ padding: 16 }}>
          <Text onPress={() => router.push("/purchase-requests/new")} style={{ color: colors.accent, textAlign: "center", fontWeight: "600" }}>
            + New Purchase Request
          </Text>
        </View>
      )}
    </View>
  );
}
