import * as React from "react";
import { Text, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useListCollections } from "@rmixerp/contract";
import { ResourceListScreen } from "../../src/components/ResourceListScreen";
import { useRequireAuth } from "../../src/lib/useRequireAuth";
import { useModulePermissions } from "../../src/lib/usePermissions";
import { colors } from "../../src/theme";

export default function CollectionsScreen() {
  const router = useRouter();
  const { ready } = useRequireAuth();
  const permissions = useModulePermissions("collections");
  const [page, setPage] = React.useState(1);

  const list = useListCollections({ page, pageSize: 20 }, { query: { enabled: ready } });
  const body = list.data?.status === 200 ? list.data.data : undefined;

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: "Collections" }} />
      <ResourceListScreen
        items={body?.items ?? []}
        total={body?.total ?? 0}
        page={page}
        pageSize={20}
        isLoading={list.isLoading}
        onPageChange={setPage}
        onPressItem={(item) => router.push(`/collections/${item.id}`)}
        renderRow={(item) => ({
          title: `${item.receiptNumber} — ${item.amountJod} JOD`,
          subtitle: `${item.method.replace(/_/g, " ")} — ${new Date(item.receivedAt).toLocaleDateString()}`,
        })}
      />
      {permissions.create && (
        <View style={{ padding: 16 }}>
          <Text onPress={() => router.push("/collections/new")} style={{ color: colors.accent, textAlign: "center", fontWeight: "600" }}>
            + Record Collection
          </Text>
        </View>
      )}
    </View>
  );
}
