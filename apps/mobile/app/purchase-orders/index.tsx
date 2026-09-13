import * as React from "react";
import { Text, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useListPurchaseOrders } from "@rmixerp/contract";
import { ResourceListScreen } from "../../src/components/ResourceListScreen";
import { useRequireAuth } from "../../src/lib/useRequireAuth";
import { useModulePermissions } from "../../src/lib/usePermissions";
import { colors } from "../../src/theme";

export default function PurchaseOrdersScreen() {
  const router = useRouter();
  const { ready } = useRequireAuth();
  const permissions = useModulePermissions("purchaseOrders");
  const [page, setPage] = React.useState(1);

  const list = useListPurchaseOrders({ page, pageSize: 20 }, { query: { enabled: ready } });
  const body = list.data?.status === 200 ? list.data.data : undefined;

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: "Purchase Orders" }} />
      <ResourceListScreen
        items={body?.items ?? []}
        total={body?.total ?? 0}
        page={page}
        pageSize={20}
        isLoading={list.isLoading}
        onPageChange={setPage}
        onPressItem={(item) => router.push(`/purchase-orders/${item.id}`)}
        renderRow={(item) => ({
          title: `${item.poNumber} — ${item.status.toUpperCase()}`,
          subtitle: `${item.totalJod} JOD`,
        })}
      />
      {permissions.create && (
        <View style={{ padding: 16 }}>
          <Text onPress={() => router.push("/purchase-orders/new")} style={{ color: colors.accent, textAlign: "center", fontWeight: "600" }}>
            + New Purchase Order
          </Text>
        </View>
      )}
    </View>
  );
}
