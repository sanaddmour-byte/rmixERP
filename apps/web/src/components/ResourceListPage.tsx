import * as React from "react";
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from "@rmixerp/ui";
import { useLanguage } from "../i18n/LanguageContext";
import { downloadCsv } from "../lib/downloadCsv";
import { throwIfApiError } from "../lib/apiResult";

export interface Column<T> {
  key: keyof T;
  header: string;
  render?: (row: T) => React.ReactNode;
}

export interface FieldConfig {
  name: string;
  label: string;
  type: "text" | "number" | "date" | "select" | "checkbox" | "multiselect";
  options?: { value: string; label: string }[];
  required?: boolean;
}

export type FormValues = Record<string, string | boolean | string[]>;

interface ResourceFormProps {
  fields: FieldConfig[];
  initialValues?: FormValues;
  onSubmit: (values: FormValues) => void;
  onCancel: () => void;
  pending: boolean;
  error?: string | null | undefined;
  submitLabel: string;
}

function ResourceForm({ fields, initialValues, onSubmit, onCancel, pending, error, submitLabel }: ResourceFormProps) {
  const [values, setValues] = React.useState<FormValues>(() => initialValues ?? {});

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit(values);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 p-4">
      {fields.map((field) => (
        <label key={field.name} className="flex flex-col gap-1 text-sm">
          {field.label}
          {field.type === "select" ? (
            <select
              className="h-10 rounded-md border border-navy-300 bg-white px-3 text-sm dark:border-navy-700 dark:bg-navy-900 dark:text-navy-100"
              required={field.required}
              value={typeof values[field.name] === "string" ? (values[field.name] as string) : ""}
              onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value }))}
            >
              <option value="" disabled>
                Select…
              </option>
              {field.options?.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          ) : field.type === "checkbox" ? (
            <input
              type="checkbox"
              checked={Boolean(values[field.name])}
              onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.checked }))}
            />
          ) : field.type === "multiselect" ? (
            <div className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-md border border-navy-200 p-2 dark:border-navy-700">
              {field.options?.map((opt) => {
                const selected = Array.isArray(values[field.name]) ? (values[field.name] as string[]) : [];
                const checked = selected.includes(opt.value);
                return (
                  <label key={opt.value} className="flex items-center gap-2 text-xs font-normal">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) =>
                        setValues((v) => {
                          const current = Array.isArray(v[field.name]) ? (v[field.name] as string[]) : [];
                          return {
                            ...v,
                            [field.name]: e.target.checked
                              ? [...current, opt.value]
                              : current.filter((val) => val !== opt.value),
                          };
                        })
                      }
                    />
                    {opt.label}
                  </label>
                );
              })}
            </div>
          ) : (
            <Input
              type={field.type}
              required={field.required}
              value={typeof values[field.name] === "string" ? (values[field.name] as string) : ""}
              onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value }))}
            />
          )}
        </label>
      ))}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

interface ResourceListPageProps<T extends { id: string }> {
  title: string;
  columns: Column<T>[];
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  isLoading: boolean;
  onPageChange: (page: number) => void;
  onSearch: (q: string) => void;
  csvUrl?: string;
  createFields: FieldConfig[];
  /** Returns the awaited mutation result (e.g. `create.mutateAsync(...)`) so the form can tell a genuine success apart from a documented non-2xx response and keep the user's draft on screen, with the real error, until it actually saves. */
  onCreate: (values: FormValues) => Promise<unknown>;
  creating: boolean;
  editFields?: FieldConfig[];
  onUpdate?: (id: string, values: FormValues) => Promise<unknown>;
  updating?: boolean;
  onVoid: (id: string) => void;
  voiding: boolean;
  permissions: { create: boolean; edit: boolean; void: boolean };
}

export function ResourceListPage<T extends { id: string }>({
  title,
  columns,
  items,
  total,
  page,
  pageSize,
  isLoading,
  onPageChange,
  onSearch,
  csvUrl,
  createFields,
  onCreate,
  creating,
  editFields,
  onUpdate,
  updating,
  onVoid,
  voiding,
  permissions,
}: ResourceListPageProps<T>) {
  const { t } = useLanguage();
  const [showCreate, setShowCreate] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [createFormError, setCreateFormError] = React.useState<string | null>(null);
  const [editFormError, setEditFormError] = React.useState<string | null>(null);
  const [exporting, setExporting] = React.useState(false);
  const [exportError, setExportError] = React.useState<string | null>(null);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const editingRow = items.find((i) => i.id === editingId);

  async function handleExport() {
    if (!csvUrl) return;
    setExporting(true);
    setExportError(null);
    const result = await downloadCsv(csvUrl, `${title.toLowerCase().replace(/\s+/g, "-")}.csv`);
    if (!result.ok) setExportError(result.error);
    setExporting(false);
  }

  // Keeps the user's typed draft on screen, with the real server error,
  // until the record actually saves — `onCreate`/`onUpdate` resolve
  // successfully even for a documented 400/403/409 (the generated client
  // never throws for those), so success has to be read from the awaited
  // result's own status, not just "the promise didn't reject".
  async function handleCreateSubmit(values: FormValues) {
    setCreateFormError(null);
    try {
      const result = await onCreate(values);
      throwIfApiError(result);
      setShowCreate(false);
    } catch (err) {
      setCreateFormError(err instanceof Error ? err.message : "Could not save — please check the fields and try again.");
    }
  }

  async function handleEditSubmit(values: FormValues) {
    if (!onUpdate || !editingRow) return;
    setEditFormError(null);
    try {
      const result = await onUpdate(editingRow.id, values);
      throwIfApiError(result);
      setEditingId(null);
    } catch (err) {
      setEditFormError(err instanceof Error ? err.message : "Could not save — please check the fields and try again.");
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>{title}</CardTitle>
        <div className="flex items-center gap-2">
          {exportError && <span className="text-xs text-orange-700">{exportError}</span>}
          {csvUrl && (
            <Button variant="outline" size="sm" disabled={exporting} onClick={() => void handleExport()}>
              {exporting ? t.resource.exporting : t.resource.exportCsv}
            </Button>
          )}
          {permissions.create && (
            <Button variant="accent" size="sm" onClick={() => setShowCreate(true)}>
              {t.resource.new}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Input
          placeholder={t.resource.search}
          onChange={(e) => onSearch(e.target.value)}
          className="max-w-xs"
        />

        {showCreate && (
          <Card className="border-navy-300 dark:border-navy-600">
            <ResourceForm
              fields={createFields}
              onSubmit={(values) => void handleCreateSubmit(values)}
              onCancel={() => {
                setShowCreate(false);
                setCreateFormError(null);
              }}
              pending={creating}
              error={createFormError}
              submitLabel={t.resource.create}
            />
          </Card>
        )}

        {editingRow && editFields && onUpdate && (
          <Card className="border-navy-300 dark:border-navy-600">
            <ResourceForm
              fields={editFields}
              initialValues={editFields.reduce<FormValues>((acc, f) => {
                const value = (editingRow as Record<string, unknown>)[f.name];
                if (typeof value === "boolean" || Array.isArray(value)) {
                  acc[f.name] = value as boolean | string[];
                } else if (f.type === "date" && typeof value === "string") {
                  acc[f.name] = value.slice(0, 10); // ISO date-time -> the yyyy-mm-dd a native date input expects
                } else {
                  acc[f.name] = value?.toString() ?? "";
                }
                return acc;
              }, {})}
              onSubmit={(values) => void handleEditSubmit(values)}
              onCancel={() => {
                setEditingId(null);
                setEditFormError(null);
              }}
              pending={Boolean(updating)}
              error={editFormError}
              submitLabel={t.resource.save}
            />
          </Card>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-navy-200 text-left text-navy-500 dark:border-navy-800 dark:text-navy-400">
                {columns.map((col) => (
                  <th key={String(col.key)} className="py-2 pe-4 font-medium">
                    {col.header}
                  </th>
                ))}
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={columns.length + 1} className="py-4 text-center text-navy-400 dark:text-navy-500">
                    {t.resource.loading}
                  </td>
                </tr>
              )}
              {!isLoading && items.length === 0 && (
                <tr>
                  <td colSpan={columns.length + 1} className="py-4 text-center text-navy-400 dark:text-navy-500">
                    {t.resource.empty}
                  </td>
                </tr>
              )}
              {items.map((row) => (
                <tr key={row.id} className="border-b border-navy-100 dark:border-navy-800">
                  {columns.map((col) => (
                    <td key={String(col.key)} className="py-2 pe-4">
                      {col.render ? col.render(row) : String(row[col.key] ?? "")}
                    </td>
                  ))}
                  <td className="py-2 text-end">
                    <div className="flex justify-end gap-2">
                      {permissions.edit && editFields && onUpdate && (
                        <Button variant="ghost" size="sm" onClick={() => setEditingId(row.id)}>
                          {t.resource.edit}
                        </Button>
                      )}
                      {permissions.void && (
                        <Button variant="ghost" size="sm" disabled={voiding} onClick={() => onVoid(row.id)}>
                          {t.resource.remove}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between text-sm text-navy-500 dark:text-navy-400">
          <span>{t.resource.pageOf(page, totalPages, total)}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
              {t.resource.previous}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
            >
              {t.resource.next}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
