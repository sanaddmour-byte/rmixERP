import * as React from "react";
import {
  useCreateMixDesign,
  useCreateMixDesignIngredient,
  useGetMixDesign,
  useListBranches,
  useListMixDesigns,
  useListProducts,
  useListRawMaterials,
  useVoidMixDesign,
  useVoidMixDesignIngredient,
  type MixDesign,
} from "@rmixerp/contract";
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from "@rmixerp/ui";
import { ResourceListPage, type FieldConfig, type FormValues } from "../components/ResourceListPage";
import { refetchOnSuccess } from "../lib/refetchOnSuccess";
import { useModulePermissions } from "../lib/usePermissions";

function MixDesignIngredients({ mixDesignId }: { mixDesignId: string }) {
  const detail = useGetMixDesign(mixDesignId);
  const rawMaterials = useListRawMaterials({ page: 1, pageSize: 100 });
  const createIngredient = useCreateMixDesignIngredient(refetchOnSuccess(detail));
  const voidIngredient = useVoidMixDesignIngredient(refetchOnSuccess(detail));

  const [rawMaterialId, setRawMaterialId] = React.useState("");
  const [quantityPerM3, setQuantityPerM3] = React.useState("");

  const materialOptions =
    rawMaterials.data?.status === 200 && typeof rawMaterials.data.data !== "string" ? rawMaterials.data.data.items : [];
  const ingredients = detail.data?.status === 200 ? detail.data.data.ingredients : [];

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    createIngredient.mutate({ mixDesignId, data: { rawMaterialId, quantityPerM3 } });
    setRawMaterialId("");
    setQuantityPerM3("");
  }

  return (
    <Card className="border-navy-300">
      <CardHeader>
        <CardTitle className="text-base">Ingredients</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-navy-200 text-left text-navy-500">
              <th className="py-2 pe-4 font-medium">Raw Material</th>
              <th className="py-2 pe-4 font-medium">Qty per m³</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {ingredients.map((ing) => (
              <tr key={ing.id} className="border-b border-navy-100">
                <td className="py-2 pe-4">{materialOptions.find((m) => m.id === ing.rawMaterialId)?.name ?? ing.rawMaterialId}</td>
                <td className="py-2 pe-4">{ing.quantityPerM3}</td>
                <td className="py-2 text-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={voidIngredient.isPending}
                    onClick={() => voidIngredient.mutate({ mixDesignId, id: ing.id, data: {} })}
                  >
                    Remove
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs">
            Raw material
            <select
              className="h-10 rounded-md border border-navy-300 bg-white px-3 text-sm"
              required
              value={rawMaterialId}
              onChange={(e) => setRawMaterialId(e.target.value)}
            >
              <option value="" disabled>
                Select…
              </option>
              {materialOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.unit})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            Quantity per m³
            <Input required value={quantityPerM3} onChange={(e) => setQuantityPerM3(e.target.value)} className="w-32" />
          </label>
          <Button type="submit" size="sm" disabled={createIngredient.isPending}>
            Add
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function MixDesignsPage() {
  const [page, setPage] = React.useState(1);
  const [q, setQ] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const permissions = useModulePermissions("mixDesigns");

  const branches = useListBranches({ page: 1, pageSize: 100 });
  const branchOptions =
    branches.data?.status === 200 && typeof branches.data.data !== "string" ? branches.data.data.items : [];
  const products = useListProducts({ page: 1, pageSize: 100 });
  const productOptions =
    products.data?.status === 200 && typeof products.data.data !== "string" ? products.data.data.items : [];

  const fields: FieldConfig[] = [
    {
      name: "branchId",
      label: "Branch",
      type: "select",
      required: true,
      options: branchOptions.map((b) => ({ value: b.id, label: b.name })),
    },
    {
      name: "productId",
      label: "Product",
      type: "select",
      required: true,
      options: productOptions.map((p) => ({ value: p.id, label: p.name })),
    },
    { name: "name", label: "Name", type: "text", required: true },
    { name: "description", label: "Description", type: "text" },
    { name: "isActive", label: "Active", type: "checkbox" },
  ];

  function toRequestBody(values: FormValues) {
    return {
      branchId: String(values.branchId ?? ""),
      productId: String(values.productId ?? ""),
      name: String(values.name ?? ""),
      ...(values.description && { description: String(values.description) }),
      isActive: Boolean(values.isActive),
    };
  }

  const list = useListMixDesigns({ page, pageSize: 20, ...(q && { q }) });
  const create = useCreateMixDesign(refetchOnSuccess(list));
  const voidMutation = useVoidMixDesign(refetchOnSuccess(list));

  const body = list.data?.status === 200 && typeof list.data.data !== "string" ? list.data.data : undefined;

  return (
    <div className="space-y-4">
      <ResourceListPage<MixDesign>
        title="Mix Designs"
        columns={[
          { key: "name", header: "Name" },
          { key: "branchId", header: "Branch", render: (row) => branchOptions.find((b) => b.id === row.branchId)?.name ?? row.branchId },
          { key: "productId", header: "Product", render: (row) => productOptions.find((p) => p.id === row.productId)?.name ?? row.productId },
          { key: "isActive", header: "Active" },
        ]}
        items={body?.items ?? []}
        total={body?.total ?? 0}
        page={page}
        pageSize={20}
        isLoading={list.isLoading}
        onPageChange={setPage}
        onSearch={setQ}
        createFields={fields}
        onCreate={(values) =>
          create.mutate(
            { data: toRequestBody(values) },
            { onSuccess: (result) => result.status === 201 && setSelectedId(result.data.id) },
          )
        }
        creating={create.isPending}
        onVoid={(id) => voidMutation.mutate({ id, data: {} })}
        voiding={voidMutation.isPending}
        permissions={{ ...permissions, edit: false }}
      />

      {body && body.items.length > 0 && (
        <label className="flex flex-col gap-1 text-sm">
          Manage ingredients for
          <select
            className="h-10 max-w-sm rounded-md border border-navy-300 bg-white px-3 text-sm"
            value={selectedId ?? ""}
            onChange={(e) => setSelectedId(e.target.value || null)}
          >
            <option value="">Select a mix design…</option>
            {body.items.map((md) => (
              <option key={md.id} value={md.id}>
                {md.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {selectedId && <MixDesignIngredients mixDesignId={selectedId} />}
    </div>
  );
}
