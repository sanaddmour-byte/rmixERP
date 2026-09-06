import * as React from "react";
import { Stack, useLocalSearchParams } from "expo-router";
import { useGetProduct } from "@rmixerp/contract";
import { DetailScreen } from "../../src/components/DetailScreen";
import { useLanguage } from "../../src/i18n/LanguageContext";
import { useRequireAuth } from "../../src/lib/useRequireAuth";

export default function ProductDetailScreen() {
  const { t } = useLanguage();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { ready } = useRequireAuth();
  const detail = useGetProduct(id, { query: { enabled: ready && Boolean(id) } });
  const product = detail.data?.status === 200 ? detail.data.data : undefined;

  return (
    <>
      <Stack.Screen options={{ title: product?.name ?? t.nav.products }} />
      <DetailScreen
        isLoading={detail.isLoading}
        notFound={!detail.isLoading && !product}
        notFoundLabel={t.resource.notFound}
        fields={
          product
            ? [
                { label: "Name", value: product.name },
                { label: "Code", value: product.code },
                {
                  label: "Strength (MPa)",
                  value: product.characteristicStrengthMpa != null ? String(product.characteristicStrengthMpa) : "—",
                },
                { label: "Unit", value: product.unit },
                { label: "Description", value: product.description ?? "—" },
              ]
            : []
        }
      />
    </>
  );
}
