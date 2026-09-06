import * as React from "react";
import {
  useCreatePriceList,
  useCreatePriceListLine,
  useGetPriceList,
  useListBranches,
  useListCustomers,
  useListPriceLists,
  useListProducts,
  useVoidPriceList,
  useVoidPriceListLine,
  type PriceList,
} from "@rmixerp/contract";
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from "@rmixerp/ui";
import { ResourceListPage, type FieldConfig, type FormValues } from "../components/ResourceListPage";
import { refetchOnSuccess } from "../lib/refetchOnSuccess";
import { useModulePermissions } from "../lib/usePermissions";

function PriceListLines({ priceListId }: { priceListId: string }) {
  const detail = useGetPriceList(priceListId);
  const products = useListProducts({ page: 1, pageSize: 100 });
  const createLine = useCreatePriceListLine(refetchOnSuccess(detail));
  const voidLine = useVoidPriceListLine(refetchOnSuccess(detail));

  const [productId, setProductId] = React.useState("");
  const [concretePrice, setConcretePrice] = React.useState("");
  const [deliveryPrice, setDeliveryPrice] = React.useState("");
  const [effectiveFrom, setEffectiveFrom] = React.useState(() => new Date().toISOString().slice(0, 10));

  const productOptions =
    products.data?.status === 200 && typeof products.data.data !== "string" ? products.data.data.items : [];
  const lines = detail.data?.status === 200 ? detail.data.data.lines : [];

  function handleAddLine(e: React.FormEvent) {
    e.preventDefault();
    createLine.mutate({
      priceListId,
      data: {
        productId,
        concreteUnitPriceJod: concretePrice,
        deliveryUnitPriceJod: deliveryPrice,
        effectiveFrom: new Date(effectiveFrom).toISOString(),
      },
    });
  }

  return (
    <Card className="border-navy-300">
      <CardHeader>
        <CardTitle className="text-base">Price list lines</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-navy-200 text-left text-navy-500">
              <th className="py-2 pe-4 font-medium">Product</th>
              <th className="py-2 pe-4 font-medium">Concrete (JOD)</th>
              <th className="py-2 pe-4 font-medium">Delivery (JOD)</th>
              <th className="py-2 pe-4 font-medium">Effective From</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id} className="border-b border-navy-100">
                <td className="py-2 pe-4">{productOptions.find((p) => p.id === line.productId)?.name ?? line.productId}</td>
                <td className="py-2 pe-4">{line.concreteUnitPriceJod}</td>
                <td className="py-2 pe-4">{line.deliveryUnitPriceJod}</td>
                <td className="py-2 pe-4">{new Date(line.effectiveFrom).toLocaleDateString()}</td>
                <td className="py-2 text-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={voidLine.isPending}
                    onClick={() => voidLine.mutate({ priceListId, id: line.id, data: {} })}
                  >
                    Remove
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <form onSubmit={handleAddLine} className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs">
            Product
            <select
              className="h-10 rounded-md border border-navy-300 bg-white px-3 text-sm"
              required
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
            >
              <option value="" disabled>
                Select…
              </option>
              {productOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            Concrete price (JOD)
            <Input required value={concretePrice} onChange={(e) => setConcretePrice(e.target.value)} className="w-32" />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            Delivery price (JOD)
            <Input required value={deliveryPrice} onChange={(e) => setDeliveryPrice(e.target.value)} className="w-32" />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            Effective from
            <Input
              type="date"
              required
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
              className="w-40"
            />
          </label>
          <Button type="submit" size="sm" disabled={createLine.isPending}>
            Add line
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function PriceListsPage() {
  const [page, setPage] = React.useState(1);
  const [q, setQ] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const permissions = useModulePermissions("priceLists");

  const branches = useListBranches({ page: 1, pageSize: 100 });
  const branchOptions =
    branches.data?.status === 200 && typeof branches.data.data !== "string"
      ? branches.data.data.items.map((b) => ({ value: b.id, label: b.name }))
      : [];
  const customers = useListCustomers({ page: 1, pageSize: 100 });
  const customerOptions =
    customers.data?.status === 200 && typeof customers.data.data !== "string"
      ? customers.data.data.items.map((c) => ({ value: c.id, label: c.name }))
      : [];

  const fields: FieldConfig[] = [
    { name: "name", label: "Name", type: "text", required: true },
    {
      name: "tier",
      label: "Tier",
      type: "select",
      required: true,
      options: [
        { value: "company", label: "Company default" },
        { value: "branch", label: "Branch" },
        { value: "customer", label: "Customer" },
        { value: "project", label: "Project" },
      ],
    },
    { name: "branchId", label: "Branch (if tier=branch)", type: "select", options: branchOptions },
    { name: "customerId", label: "Customer (if tier=customer)", type: "select", options: customerOptions },
  ];

  const list = useListPriceLists({ page, pageSize: 20, ...(q && { q }) });
  const create = useCreatePriceList(refetchOnSuccess(list));
  const voidMutation = useVoidPriceList(refetchOnSuccess(list));

  const body = list.data?.status === 200 && typeof list.data.data !== "string" ? list.data.data : undefined;

  return (
    <div className="space-y-4">
      <ResourceListPage<PriceList>
        title="Price Lists"
        columns={[
          { key: "name", header: "Name" },
          { key: "tier", header: "Tier" },
          { key: "isActive", header: "Active" },
        ]}
        items={body?.items ?? []}
        total={body?.total ?? 0}
        page={page}
        pageSize={20}
        isLoading={list.isLoading}
        onPageChange={setPage}
        onSearch={setQ}
        csvUrl={`/api/price-lists?format=csv${q ? `&q=${encodeURIComponent(q)}` : ""}`}
        createFields={fields}
        onCreate={(values: FormValues) =>
          create.mutate({
            data: {
              name: String(values.name ?? ""),
              tier: String(values.tier ?? "company") as "company" | "branch" | "customer" | "project",
              ...(values.branchId && { branchId: String(values.branchId) }),
              ...(values.customerId && { customerId: String(values.customerId) }),
            },
          })
        }
        creating={create.isPending}
        onVoid={(id) => voidMutation.mutate({ id, data: {} })}
        voiding={voidMutation.isPending}
        permissions={{ ...permissions, edit: false }}
      />

      {body && body.items.length > 0 && (
        <label className="flex flex-col gap-1 text-sm">
          Manage lines for
          <select
            className="h-10 max-w-sm rounded-md border border-navy-300 bg-white px-3 text-sm"
            value={selectedId ?? ""}
            onChange={(e) => setSelectedId(e.target.value || null)}
          >
            <option value="">Select a price list…</option>
            {body.items.map((pl) => (
              <option key={pl.id} value={pl.id}>
                {pl.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {selectedId && <PriceListLines priceListId={selectedId} />}
    </div>
  );
}
