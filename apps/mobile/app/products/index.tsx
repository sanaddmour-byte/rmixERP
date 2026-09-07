import * as React from "react";
import { View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useListProducts } from "@rmixerp/contract";
import { ResourceListScreen } from "../../src/components/ResourceListScreen";
import { useLanguage } from "../../src/i18n/LanguageContext";
import { useRequireAuth } from "../../src/lib/useRequireAuth";

export default function ProductsScreen() {
  const { t } = useLanguage();
  const router = useRouter();
  const { ready } = useRequireAuth();
  const [page, setPage] = React.useState(1);
  const [q, setQ] = React.useState("");

  const list = useListProducts(
    { page, pageSize: 20, ...(q && { q }) },
    { query: { enabled: ready } },
  );
  const body = list.data?.status === 200 && typeof list.data.data !== "string" ? list.data.data : undefined;

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: t.nav.products }} />
      <ResourceListScreen
        items={body?.items ?? []}
        total={body?.total ?? 0}
        page={page}
        pageSize={20}
        isLoading={list.isLoading}
        onPageChange={setPage}
        onSearch={(value) => {
          setPage(1);
          setQ(value);
        }}
        onPressItem={(item) => router.push(`/products/${item.id}`)}
        renderRow={(item) => ({ title: `${item.name} (${item.code})`, subtitle: item.unit })}
      />
    </View>
  );
}
