import * as React from "react";
import {
  useCreateAccount,
  useCreateCostCenter,
  useListAccounts,
  useListCostCenters,
  useUpdateAccount,
  type Account,
  type CreateAccountRequestType,
} from "@rmixerp/contract";
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from "@rmixerp/ui";
import { refetchOnSuccess } from "../lib/refetchOnSuccess";
import { useModulePermissions } from "../lib/usePermissions";

type AccountType = CreateAccountRequestType;
const ACCOUNT_TYPES: AccountType[] = ["asset", "liability", "equity", "revenue", "expense"];

function AccountsSection() {
  const permissions = useModulePermissions("glAccounts");
  const [type, setType] = React.useState<AccountType | "">("");
  const list = useListAccounts({ page: 1, pageSize: 200, ...(type && { type }) });
  const items = list.data?.status === 200 ? list.data.data.items : [];
  const create = useCreateAccount(refetchOnSuccess(list));
  const update = useUpdateAccount(refetchOnSuccess(list));

  const [code, setCode] = React.useState("");
  const [name, setName] = React.useState("");
  const [newType, setNewType] = React.useState<AccountType>("asset");
  const [error, setError] = React.useState<string | null>(null);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editingName, setEditingName] = React.useState("");

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    create.mutate(
      { data: { code, name, type: newType } },
      {
        onSuccess: (result) => {
          if (result.status === 201) {
            setCode("");
            setName("");
          } else {
            setError("An account with this code already exists.");
          }
        },
      },
    );
  }

  function startEdit(a: Account) {
    setEditingId(a.id);
    setEditingName(a.name);
  }

  function saveEdit(id: string) {
    update.mutate({ id, data: { name: editingName } }, { onSuccess: () => setEditingId(null) });
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Chart of Accounts</CardTitle>
        <select
          className="h-9 rounded-md border border-navy-300 bg-white px-2 text-sm dark:border-navy-700 dark:bg-navy-900 dark:text-navy-100"
          value={type}
          onChange={(e) => setType(e.target.value as AccountType | "")}
        >
          <option value="">All types</option>
          {ACCOUNT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </CardHeader>
      <CardContent className="space-y-4">
        {permissions.create && (
          <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs">
              Code
              <Input required value={code} onChange={(e) => setCode(e.target.value)} className="w-24" />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              Name
              <Input required value={name} onChange={(e) => setName(e.target.value)} className="w-56" />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              Type
              <select
                className="h-10 rounded-md border border-navy-300 bg-white px-3 text-sm dark:border-navy-700 dark:bg-navy-900 dark:text-navy-100"
                value={newType}
                onChange={(e) => setNewType(e.target.value as AccountType)}
              >
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" size="sm" disabled={create.isPending}>
              Add account
            </Button>
          </form>
        )}
        {error && <p className="text-sm text-orange-700">{error}</p>}

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-navy-200 text-left text-navy-500 dark:border-navy-800 dark:text-navy-400">
              <th className="py-2 pe-4 font-medium">Code</th>
              <th className="py-2 pe-4 font-medium">Name</th>
              <th className="py-2 pe-4 font-medium">Type</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={4} className="py-4 text-center text-navy-400 dark:text-navy-500">
                  No accounts yet.
                </td>
              </tr>
            )}
            {items.map((a) => (
              <tr key={a.id} className="border-b border-navy-100 dark:border-navy-800">
                <td className="py-2 pe-4">{a.code}</td>
                <td className="py-2 pe-4">
                  {editingId === a.id ? (
                    <Input value={editingName} onChange={(e) => setEditingName(e.target.value)} className="w-56" />
                  ) : (
                    a.name
                  )}
                </td>
                <td className="py-2 pe-4 capitalize">{a.type}</td>
                <td className="py-2 text-end">
                  {permissions.edit &&
                    (editingId === a.id ? (
                      <div className="flex justify-end gap-2">
                        <Button size="sm" disabled={update.isPending} onClick={() => saveEdit(a.id)}>
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => startEdit(a)}>
                        Edit
                      </Button>
                    ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function CostCentersSection() {
  const permissions = useModulePermissions("glAccounts");
  const list = useListCostCenters({ page: 1, pageSize: 200 });
  const items = list.data?.status === 200 ? list.data.data.items : [];
  const create = useCreateCostCenter(refetchOnSuccess(list));

  const [code, setCode] = React.useState("");
  const [name, setName] = React.useState("");

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    create.mutate({ data: { code, name } });
    setCode("");
    setName("");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cost Centers</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {permissions.create && (
          <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs">
              Code
              <Input required value={code} onChange={(e) => setCode(e.target.value)} className="w-24" />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              Name
              <Input required value={name} onChange={(e) => setName(e.target.value)} className="w-56" />
            </label>
            <Button type="submit" size="sm" disabled={create.isPending}>
              Add cost center
            </Button>
          </form>
        )}
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-navy-200 text-left text-navy-500 dark:border-navy-800 dark:text-navy-400">
              <th className="py-2 pe-4 font-medium">Code</th>
              <th className="py-2 pe-4 font-medium">Name</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={2} className="py-4 text-center text-navy-400 dark:text-navy-500">
                  No cost centers yet.
                </td>
              </tr>
            )}
            {items.map((c) => (
              <tr key={c.id} className="border-b border-navy-100 dark:border-navy-800">
                <td className="py-2 pe-4">{c.code}</td>
                <td className="py-2 pe-4">{c.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

export function ChartOfAccountsPage() {
  const permissions = useModulePermissions("glAccounts");
  if (!permissions.view) return <p className="text-sm text-navy-400">You do not have access to the chart of accounts.</p>;

  return (
    <div className="space-y-4">
      <AccountsSection />
      <CostCentersSection />
    </div>
  );
}
