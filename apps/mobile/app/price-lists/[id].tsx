import * as React from "react";
import { Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useGetPriceList, useListProducts } from "@rmixerp/contract";
import { DetailScreen } from "../../src/components/DetailScreen";
import { useLanguage } from "../../src/i18n/LanguageContext";
import { useRequireAuth } from "../../src/lib/useRequireAuth";
import { colors } from "../../src/theme";

export default function PriceListDetailScreen() {
  const { t } = useLanguage();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { ready } = useRequireAuth();
  const detail = useGetPriceList(id, { query: { enabled: ready && Boolean(id) } });
  const priceList = detail.data?.status === 200 ? detail.data.data : undefined;

  const products = useListProducts({ page: 1, pageSize: 100 }, { query: { enabled: ready } });
  const productOptions =
    products.data?.status === 200 && typeof products.data.data !== "string" ? products.data.data.items : [];

  return (
    <>
      <Stack.Screen options={{ title: priceList?.name ?? t.nav.priceLists }} />
      <DetailScreen
        isLoading={detail.isLoading}
        notFound={!detail.isLoading && !priceList}
        notFoundLabel={t.resource.notFound}
        fields={
          priceList
            ? [
                { label: "Name", value: priceList.name },
                { label: "Tier", value: priceList.tier },
                { label: "Active", value: priceList.isActive ? "Yes" : "No" },
              ]
            : []
        }
      >
        {priceList && (
          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 15, fontWeight: "600", color: colors.navy }}>Lines</Text>
            {priceList.lines.length === 0 && <Text style={{ color: colors.textMuted }}>{t.resource.empty}</Text>}
            {priceList.lines.map((line) => (
              <View key={line.id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <Text style={{ fontWeight: "600" }}>
                  {productOptions.find((p) => p.id === line.productId)?.name ?? line.productId}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                  Concrete: {line.concreteUnitPriceJod} JOD · Delivery: {line.deliveryUnitPriceJod} JOD
                </Text>
                <Text style={{ color: colors.textFaint, fontSize: 12 }}>
                  Effective from {new Date(line.effectiveFrom).toLocaleDateString()}
                </Text>
              </View>
            ))}
          </View>
        )}
      </DetailScreen>
    </>
  );
}
