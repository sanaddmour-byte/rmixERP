import * as React from "react";
import { ScrollView, Text } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useCreatePurchaseRequest, useListBranches } from "@rmixerp/contract";
import { Button } from "../../src/components/Button";
import { PickerField } from "../../src/components/PickerField";
import { useRequireAuth } from "../../src/lib/useRequireAuth";
import { colors } from "../../src/theme";

export default function NewPurchaseRequestScreen() {
  const router = useRouter();
  const { ready } = useRequireAuth();

  const branches = useListBranches({ page: 1, pageSize: 100 }, { query: { enabled: ready } });
  const branchOptions =
    branches.data?.status === 200 && typeof branches.data.data !== "string"
      ? branches.data.data.items.map((b) => ({ value: b.id, label: b.name }))
      : [];

  const [branchId, setBranchId] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const create = useCreatePurchaseRequest();

  function handleCreate() {
    setError(null);
    if (!branchId) {
      setError("Branch is required.");
      return;
    }
    create.mutate(
      { data: { branchId } },
      {
        onSuccess: (result) => {
          if (result.status === 201) {
            router.replace(`/purchase-requests/${result.data.id}`);
          } else {
            setError("Could not create the purchase request.");
          }
        },
        onError: () => setError("Could not create the purchase request."),
      },
    );
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 16 }}>
      <Stack.Screen options={{ title: "New Purchase Request" }} />
      <PickerField label="Branch" value={branchId} options={branchOptions} onChange={setBranchId} />
      {error && <Text style={{ color: colors.danger }}>{error}</Text>}
      <Button onPress={handleCreate} disabled={create.isPending} label={create.isPending ? "Creating…" : "Create"} />
    </ScrollView>
  );
}
