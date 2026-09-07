import * as React from "react";
import { Stack, useLocalSearchParams } from "expo-router";
import { useGetCustomer } from "@rmixerp/contract";
import { DetailScreen } from "../../src/components/DetailScreen";
import { useLanguage } from "../../src/i18n/LanguageContext";
import { useRequireAuth } from "../../src/lib/useRequireAuth";

export default function CustomerDetailScreen() {
  const { t } = useLanguage();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { ready } = useRequireAuth();
  const detail = useGetCustomer(id, { query: { enabled: ready && Boolean(id) } });
  const customer = detail.data?.status === 200 ? detail.data.data : undefined;

  return (
    <>
      <Stack.Screen options={{ title: customer?.name ?? t.nav.customers }} />
      <DetailScreen
        isLoading={detail.isLoading}
        notFound={!detail.isLoading && !customer}
        notFoundLabel={t.resource.notFound}
        fields={
          customer
            ? [
                { label: "Name", value: customer.name },
                { label: "Type", value: customer.customerType },
                { label: "Phone", value: customer.phone ?? "—" },
                { label: "Email", value: customer.email ?? "—" },
                { label: "Tax Number", value: customer.taxNumber ?? "—" },
                { label: "Address", value: customer.address ?? "—" },
                { label: "Credit Limit (JOD)", value: customer.creditLimitJod },
                { label: "Credit Policy", value: customer.creditPolicy },
                { label: "Payment Terms (days)", value: String(customer.paymentTermsDays) },
              ]
            : []
        }
      />
    </>
  );
}
