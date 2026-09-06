import * as React from "react";
import { Stack, useLocalSearchParams } from "expo-router";
import { useGetCustomer, useGetProject } from "@rmixerp/contract";
import { DetailScreen } from "../../src/components/DetailScreen";
import { useLanguage } from "../../src/i18n/LanguageContext";
import { useRequireAuth } from "../../src/lib/useRequireAuth";

export default function ProjectDetailScreen() {
  const { t } = useLanguage();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { ready } = useRequireAuth();
  const detail = useGetProject(id, { query: { enabled: ready && Boolean(id) } });
  const project = detail.data?.status === 200 ? detail.data.data : undefined;

  const customer = useGetCustomer(project?.customerId ?? "", {
    query: { enabled: ready && Boolean(project?.customerId) },
  });
  const customerName = customer.data?.status === 200 ? customer.data.data.name : project?.customerId;

  return (
    <>
      <Stack.Screen options={{ title: project?.name ?? t.nav.projects }} />
      <DetailScreen
        isLoading={detail.isLoading}
        notFound={!detail.isLoading && !project}
        notFoundLabel={t.resource.notFound}
        fields={
          project
            ? [
                { label: "Name", value: project.name },
                { label: "Customer", value: customerName ?? "—" },
                { label: "Address", value: project.address ?? "—" },
              ]
            : []
        }
      />
    </>
  );
}
