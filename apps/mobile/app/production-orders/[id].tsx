import * as React from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import {
  useCompleteProductionOrder,
  useGetProductionOrder,
  useListRawMaterials,
  useRecordBatch,
  useRecordReturnedConcrete,
} from "@rmixerp/contract";
import { Button } from "../../src/components/Button";
import { Input } from "../../src/components/Input";
import { useRequireAuth } from "../../src/lib/useRequireAuth";
import { colors } from "../../src/theme";

export default function ProductionOrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { ready } = useRequireAuth();

  const detail = useGetProductionOrder(id, { query: { enabled: ready && Boolean(id) } });
  const rawMaterials = useListRawMaterials({ page: 1, pageSize: 100 }, { query: { enabled: ready } });
  const materialsById = new Map(
    rawMaterials.data?.status === 200 && typeof rawMaterials.data.data !== "string"
      ? rawMaterials.data.data.items.map((m) => [m.id, m.name])
      : [],
  );

  const recordBatch = useRecordBatch();
  const recordReturn = useRecordReturnedConcrete();
  const complete = useCompleteProductionOrder();

  const [targetQuantityM3, setTargetQuantityM3] = React.useState("");
  const [actualQuantityM3, setActualQuantityM3] = React.useState("");
  const [moistureAdjustmentBasisPoints, setMoistureAdjustmentBasisPoints] = React.useState("");
  const [blocked, setBlocked] = React.useState<{ rawMaterialIds: string[] } | null>(null);
  const [overrideReason, setOverrideReason] = React.useState("");
  const [returnQuantityM3, setReturnQuantityM3] = React.useState("");
  const [returnReason, setReturnReason] = React.useState("");
  const [actionError, setActionError] = React.useState<string | null>(null);

  const o = detail.data?.status === 200 ? detail.data.data : undefined;

  function refetch() {
    void detail.refetch();
  }

  function submitBatch(override?: { reason: string }) {
    if (!targetQuantityM3 || !actualQuantityM3) {
      setActionError("Target and actual quantity are required.");
      return;
    }
    recordBatch.mutate(
      {
        id,
        data: {
          targetQuantityM3,
          actualQuantityM3,
          ...(moistureAdjustmentBasisPoints && { moistureAdjustmentBasisPoints: Number(moistureAdjustmentBasisPoints) }),
          ...(override && { override }),
        },
      },
      {
        onSuccess: (result) => {
          if (result.status === 201) {
            setBlocked(null);
            setActionError(null);
            setTargetQuantityM3("");
            setActualQuantityM3("");
            setMoistureAdjustmentBasisPoints("");
            setOverrideReason("");
            refetch();
          } else if (result.status === 409) {
            const details = result.data.error.details as { rawMaterialIds: string[] };
            setBlocked(details);
          } else {
            setActionError("Could not record the batch.");
          }
        },
      },
    );
  }

  function handleReturn() {
    if (!returnQuantityM3) return;
    recordReturn.mutate(
      { id, data: { quantityM3: returnQuantityM3, ...(returnReason && { reason: returnReason }) } },
      {
        onSuccess: (result) => {
          if (result.status === 201) {
            setReturnQuantityM3("");
            setReturnReason("");
            refetch();
          }
        },
      },
    );
  }

  if (detail.isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }
  if (!o) {
    return (
      <View style={{ flex: 1, padding: 24 }}>
        <Text style={{ color: colors.textMuted }}>Record not found.</Text>
      </View>
    );
  }

  const canRecord = o.status === "planned" || o.status === "in_progress";

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 16 }}>
      <Stack.Screen options={{ title: `Production — ${o.status.replace("_", " ")}` }} />

      <Text style={{ color: colors.textMuted }}>Planned: {o.plannedQuantityM3} m³</Text>

      {o.status === "in_progress" && (
        <Button
          label={complete.isPending ? "Completing…" : "Mark Complete"}
          onPress={() => complete.mutate({ id }, { onSuccess: refetch })}
          disabled={complete.isPending}
        />
      )}

      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 15, fontWeight: "600", color: colors.navy }}>Batches</Text>
        {o.batches.length === 0 && <Text style={{ color: colors.textMuted }}>No batches recorded yet.</Text>}
        {o.batches.map((batch) => (
          <View key={batch.id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={{ fontWeight: "600" }}>
              Batch #{batch.batchNumber} — {batch.actualQuantityM3} m³
            </Text>
            {batch.consumptions.map((c) => (
              <Text
                key={c.id}
                style={{ fontSize: 12, color: c.wentNegative ? colors.accent : colors.textMuted }}
              >
                {materialsById.get(c.rawMaterialId) ?? c.rawMaterialId}: {c.quantityConsumed} @ {c.unitCostJod} ={" "}
                {c.totalCostJod} JOD
              </Text>
            ))}
          </View>
        ))}
      </View>

      {actionError && <Text style={{ color: colors.danger }}>{actionError}</Text>}

      {blocked && (
        <View style={{ borderWidth: 1, borderColor: colors.accent, borderRadius: 6, padding: 10, gap: 8 }}>
          <Text style={{ color: colors.accent }}>
            Blocked: would take {blocked.rawMaterialIds.map((rid) => materialsById.get(rid) ?? rid).join(", ")} negative.
          </Text>
          <Input
            placeholder="Override reason (requires productionOrders:approve)"
            value={overrideReason}
            onChangeText={setOverrideReason}
          />
          <Button
            variant="accent"
            label={recordBatch.isPending ? "Recording…" : "Override & Record"}
            onPress={() => submitBatch({ reason: overrideReason })}
            disabled={recordBatch.isPending || !overrideReason}
          />
        </View>
      )}

      {canRecord && (
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 15, fontWeight: "600", color: colors.navy }}>Record Batch</Text>
          <View style={{ gap: 4 }}>
            <Text style={{ fontSize: 13, color: colors.textMuted }}>Target quantity (m³)</Text>
            <Input value={targetQuantityM3} onChangeText={setTargetQuantityM3} keyboardType="decimal-pad" />
          </View>
          <View style={{ gap: 4 }}>
            <Text style={{ fontSize: 13, color: colors.textMuted }}>Actual quantity (m³)</Text>
            <Input value={actualQuantityM3} onChangeText={setActualQuantityM3} keyboardType="decimal-pad" />
          </View>
          <View style={{ gap: 4 }}>
            <Text style={{ fontSize: 13, color: colors.textMuted }}>Moisture adjustment (basis points, optional)</Text>
            <Input value={moistureAdjustmentBasisPoints} onChangeText={setMoistureAdjustmentBasisPoints} keyboardType="numeric" />
          </View>
          <Button
            label={recordBatch.isPending ? "Recording…" : "Record Batch"}
            onPress={() => {
              setBlocked(null);
              submitBatch();
            }}
            disabled={recordBatch.isPending}
          />
        </View>
      )}

      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 15, fontWeight: "600", color: colors.navy }}>Returned Concrete</Text>
        {o.returns.map((r) => (
          <Text key={r.id} style={{ color: colors.textMuted, fontSize: 13 }}>
            {r.quantityM3} m³ — {r.reason ?? "no reason given"}
          </Text>
        ))}
        <View style={{ gap: 4 }}>
          <Text style={{ fontSize: 13, color: colors.textMuted }}>Quantity (m³)</Text>
          <Input value={returnQuantityM3} onChangeText={setReturnQuantityM3} keyboardType="decimal-pad" />
        </View>
        <View style={{ gap: 4 }}>
          <Text style={{ fontSize: 13, color: colors.textMuted }}>Reason</Text>
          <Input value={returnReason} onChangeText={setReturnReason} />
        </View>
        <Button
          variant="outline"
          label={recordReturn.isPending ? "Recording…" : "Record Return"}
          onPress={handleReturn}
          disabled={recordReturn.isPending}
        />
      </View>
    </ScrollView>
  );
}
