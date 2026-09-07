import * as React from "react";
import { View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useListProductionOrders } from "@rmixerp/contract";
import { ResourceListScreen } from "../../src/components/ResourceListScreen";
import { useRequireAuth } from "../../src/lib/useRequireAuth";

export default function ProductionOrdersScreen() {
  const router = useRouter();
  const { ready } = useRequireAuth();
  const [page, setPage] = React.useState(1);

  const list = useListProductionOrders({ page, pageSize: 20 }, { query: { enabled: ready } });
  const body = list.data?.status === 200 ? list.data.data : undefined;

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: "Production Orders" }} />
      <ResourceListScreen
        items={body?.items ?? []}
        total={body?.total ?? 0}
        page={page}
        pageSize={20}
        isLoading={list.isLoading}
        onPageChange={setPage}
        onPressItem={(item) => router.push(`/production-orders/${item.id}`)}
        renderRow={(item) => ({
          title: `${item.status.replace("_", " ").toUpperCase()} — ${item.plannedQuantityM3} m³`,
        })}
      />
    </View>
  );
}
