import * as React from "react";
import { ScrollView, Text, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useCreateCollection, useListBranches, useListCustomers, useListInvoices } from "@rmixerp/contract";
import { Button } from "../../src/components/Button";
import { Input } from "../../src/components/Input";
import { PickerField } from "../../src/components/PickerField";
import { useRequireAuth } from "../../src/lib/useRequireAuth";
import { colors } from "../../src/theme";

const METHOD_OPTIONS = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "post_dated_cheque", label: "Post-dated Cheque" },
];

const ALLOCATION_OPTIONS = [
  { value: "fifo", label: "Auto (FIFO by due date)" },
  { value: "manual", label: "Manual" },
];

/**
 * Collection entry for Collectors working in the field — DOMAIN.md/PLAN.md's
 * "mobile-critical phase, collectors work in the field". PDC lifecycle
 * management (deposit/clear/bounce/cancel) stays web-only, a back-office/
 * Accountant task, not a field action — matching the established "field
 * roles" mobile-parity split (e.g. Phase 3's production-order creation).
 */
export default function NewCollectionScreen() {
  const router = useRouter();
  const { ready } = useRequireAuth();

  const customers = useListCustomers({ page: 1, pageSize: 100 }, { query: { enabled: ready } });
  const customerOptions =
    customers.data?.status === 200 && typeof customers.data.data !== "string"
      ? customers.data.data.items.map((c) => ({ value: c.id, label: c.name }))
      : [];
  const branches = useListBranches({ page: 1, pageSize: 100 }, { query: { enabled: ready } });
  const branchOptions =
    branches.data?.status === 200 && typeof branches.data.data !== "string"
      ? branches.data.data.items.map((b) => ({ value: b.id, label: b.name }))
      : [];

  const [customerId, setCustomerId] = React.useState("");
  const [branchId, setBranchId] = React.useState("");
  const [method, setMethod] = React.useState<"cash" | "bank_transfer" | "post_dated_cheque">("cash");
  const [amountJod, setAmountJod] = React.useState("");
  const [reference, setReference] = React.useState("");
  const [bankName, setBankName] = React.useState("");
  const [chequeNumber, setChequeNumber] = React.useState("");
  const [chequeDueDate, setChequeDueDate] = React.useState("");
  const [allocationMode, setAllocationMode] = React.useState<"fifo" | "manual">("fifo");
  const [manualInvoiceId, setManualInvoiceId] = React.useState("");
  const [manualAmountJod, setManualAmountJod] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const openInvoices = useListInvoices(
    { page: 1, pageSize: 100, status: "issued", ...(customerId && { customerId }) },
    { query: { enabled: ready && allocationMode === "manual" } },
  );
  const openInvoiceOptions =
    openInvoices.data?.status === 200 ? openInvoices.data.data.items.map((i) => ({ value: i.id, label: `${i.invoiceNumber} — ${i.totalJod} JOD` })) : [];

  const create = useCreateCollection();

  function handleCreate() {
    setError(null);
    if (!customerId || !branchId || !amountJod) {
      setError("Customer, branch, and amount are required.");
      return;
    }
    if (method === "post_dated_cheque" && (!bankName || !chequeNumber || !chequeDueDate)) {
      setError("Bank, cheque number, and cheque due date are required for a post-dated cheque.");
      return;
    }
    create.mutate(
      {
        data: {
          customerId,
          branchId,
          method,
          amountJod,
          receivedAt: new Date().toISOString(),
          allocationMode,
          ...(reference && { reference }),
          ...(method === "post_dated_cheque" && { bankName, chequeNumber, chequeDueDate: new Date(chequeDueDate).toISOString() }),
          ...(allocationMode === "manual" && manualInvoiceId && { allocations: [{ invoiceId: manualInvoiceId, amountJod: manualAmountJod }] }),
        },
      },
      {
        onSuccess: (result) => {
          if (result.status === 201) {
            router.replace(`/collections/${result.data.id}`);
          } else {
            setError("Could not record the collection — check the amount and allocation.");
          }
        },
        onError: () => setError("Could not record the collection."),
      },
    );
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 16 }}>
      <Stack.Screen options={{ title: "Record Collection" }} />
      <PickerField label="Customer" value={customerId} options={customerOptions} onChange={setCustomerId} />
      <PickerField label="Branch" value={branchId} options={branchOptions} onChange={setBranchId} />
      <PickerField label="Method" value={method} options={METHOD_OPTIONS} onChange={(v) => setMethod(v as typeof method)} />
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 13, color: colors.textMuted }}>Amount (JOD)</Text>
        <Input value={amountJod} onChangeText={setAmountJod} keyboardType="decimal-pad" />
      </View>
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 13, color: colors.textMuted }}>Reference (optional)</Text>
        <Input value={reference} onChangeText={setReference} />
      </View>

      {method === "post_dated_cheque" && (
        <View style={{ gap: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 6, padding: 12 }}>
          <View style={{ gap: 4 }}>
            <Text style={{ fontSize: 13, color: colors.textMuted }}>Bank</Text>
            <Input value={bankName} onChangeText={setBankName} />
          </View>
          <View style={{ gap: 4 }}>
            <Text style={{ fontSize: 13, color: colors.textMuted }}>Cheque number</Text>
            <Input value={chequeNumber} onChangeText={setChequeNumber} />
          </View>
          <View style={{ gap: 4 }}>
            <Text style={{ fontSize: 13, color: colors.textMuted }}>Cheque due date (YYYY-MM-DD)</Text>
            <Input value={chequeDueDate} onChangeText={setChequeDueDate} placeholder="2026-06-01" />
          </View>
        </View>
      )}

      <PickerField label="Allocation" value={allocationMode} options={ALLOCATION_OPTIONS} onChange={(v) => setAllocationMode(v as typeof allocationMode)} />
      {allocationMode === "manual" && (
        <View style={{ gap: 12 }}>
          <PickerField label="Invoice" value={manualInvoiceId} options={openInvoiceOptions} onChange={setManualInvoiceId} />
          <View style={{ gap: 4 }}>
            <Text style={{ fontSize: 13, color: colors.textMuted }}>Amount for this invoice (JOD)</Text>
            <Input value={manualAmountJod} onChangeText={setManualAmountJod} keyboardType="decimal-pad" />
          </View>
        </View>
      )}

      {error && <Text style={{ color: colors.danger }}>{error}</Text>}
      <Button onPress={handleCreate} disabled={create.isPending} label={create.isPending ? "Recording…" : "Record Collection"} />
    </ScrollView>
  );
}
