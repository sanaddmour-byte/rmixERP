import * as React from "react";
import { ScrollView, Text } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCreatePurchaseOrder, useListBranches, useListVendors } from "@rmixerp/contract";
import { Button } from "../../src/components/Button";
import { PickerField } from "../../src/components/PickerField";
import { useRequireAuth } from "../../src/lib/useRequireAuth";
import { colors } from "../../src/theme";

export default function NewPurchaseOrderScreen() {
  const router = useRouter();
  const { ready } = useRequireAuth();
  const { purchaseRequestId } = useLocalSearchParams<{ purchaseRequestId?: string }>();

  const branches = useListBranches({ page: 1, pageSize: 100 }, { query: { enabled: ready } });
  const branchOptions =
    branches.data?.status === 200 && typeof branches.data.data !== "string"
      ? branches.data.data.items.map((b) => ({ value: b.id, label: b.name }))
      : [];
  const vendors = useListVendors({ page: 1, pageSize: 100 }, { query: { enabled: ready } });
  const vendorOptions =
    vendors.data?.status === 200 && typeof vendors.data.data !== "string"
      ? vendors.data.data.items.map((v) => ({ value: v.id, label: v.name }))
      : [];

  const [branchId, setBranchId] = React.useState("");
  const [vendorId, setVendorId] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const create = useCreatePurchaseOrder();

  function handleCreate() {
    setError(null);
    if (!branchId || !vendorId) {
      setError("Branch and vendor are required.");
      return;
    }
    create.mutate(
      { data: { branchId, vendorId, ...(purchaseRequestId && { purchaseRequestId }) } },
      {
        onSuccess: (result) => {
          if (result.status === 201) {
            router.replace(`/purchase-orders/${result.data.id}`);
          } else {
            setError("Could not create the purchase order.");
          }
        },
        onError: () => setError("Could not create the purchase order."),
      },
    );
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 16 }}>
      <Stack.Screen options={{ title: purchaseRequestId ? "New PO (from Request)" : "New Purchase Order" }} />
      <PickerField label="Branch" value={branchId} options={branchOptions} onChange={setBranchId} />
      <PickerField label="Vendor" value={vendorId} options={vendorOptions} onChange={setVendorId} />
      {error && <Text style={{ color: colors.danger }}>{error}</Text>}
      <Button onPress={handleCreate} disabled={create.isPending} label={create.isPending ? "Creating…" : "Create"} />
    </ScrollView>
  );
}
