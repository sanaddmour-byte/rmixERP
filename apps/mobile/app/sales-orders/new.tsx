import * as React from "react";
import { ScrollView, Text, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useCreateSalesOrder, useListBranches, useListCustomers, useListProjects } from "@rmixerp/contract";
import { Button } from "../../src/components/Button";
import { Input } from "../../src/components/Input";
import { PickerField } from "../../src/components/PickerField";
import { useRequireAuth } from "../../src/lib/useRequireAuth";
import { colors } from "../../src/theme";

export default function NewSalesOrderScreen() {
  const router = useRouter();
  const { ready } = useRequireAuth();

  const branches = useListBranches({ page: 1, pageSize: 100 }, { query: { enabled: ready } });
  const customers = useListCustomers({ page: 1, pageSize: 100 }, { query: { enabled: ready } });
  const projects = useListProjects({ page: 1, pageSize: 100 }, { query: { enabled: ready } });

  const branchOptions =
    branches.data?.status === 200 && typeof branches.data.data !== "string"
      ? branches.data.data.items.map((b) => ({ value: b.id, label: b.name }))
      : [];
  const customerOptions =
    customers.data?.status === 200 && typeof customers.data.data !== "string"
      ? customers.data.data.items.map((c) => ({ value: c.id, label: c.name }))
      : [];
  const projectOptions =
    projects.data?.status === 200 && typeof projects.data.data !== "string"
      ? projects.data.data.items.map((p) => ({ value: p.id, label: p.name }))
      : [];

  const [customerId, setCustomerId] = React.useState("");
  const [branchId, setBranchId] = React.useState("");
  const [projectId, setProjectId] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const create = useCreateSalesOrder();

  function handleCreate() {
    setError(null);
    if (!customerId || !branchId) {
      setError("Customer and branch are required.");
      return;
    }
    create.mutate(
      { data: { customerId, branchId, ...(projectId && { projectId }), ...(notes && { notes }) } },
      {
        onSuccess: (result) => {
          if (result.status === 201) {
            router.replace(`/sales-orders/${result.data.id}`);
          } else {
            setError("Could not create the sales order.");
          }
        },
        onError: () => setError("Could not create the sales order."),
      },
    );
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 16 }}>
      <Stack.Screen options={{ title: "New Sales Order" }} />
      <PickerField label="Customer" value={customerId} options={customerOptions} onChange={setCustomerId} />
      <PickerField label="Branch" value={branchId} options={branchOptions} onChange={setBranchId} />
      <PickerField label="Project (optional)" value={projectId} options={projectOptions} onChange={setProjectId} placeholder="None" />
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 13, color: colors.textMuted }}>Notes</Text>
        <Input value={notes} onChangeText={setNotes} />
      </View>
      {error && <Text style={{ color: colors.danger }}>{error}</Text>}
      <Button onPress={handleCreate} disabled={create.isPending} label={create.isPending ? "Creating…" : "Create"} />
    </ScrollView>
  );
}
