import * as React from "react";
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from "@rmixerp/ui";
import { useLanguage } from "../i18n/LanguageContext";

export interface Column<T> {
  key: keyof T;
  header: string;
  render?: (row: T) => React.ReactNode;
}

export interface FieldConfig {
  name: string;
  label: string;
  type: "text" | "number" | "select" | "checkbox" | "multiselect";
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
              className="h-10 rounded-md border border-navy-300 bg-white px-3 text-sm"
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
            <div className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-md border border-navy-200 p-2">
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
  onCreate: (values: FormValues) => void;
  creating: boolean;
  createError?: string | null;
  editFields?: FieldConfig[];
  onUpdate?: (id: string, values: FormValues) => void;
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
  createError,
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
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const editingRow = items.find((i) => i.id === editingId);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>{title}</CardTitle>
        <div className="flex gap-2">
          {csvUrl && (
            <a href={csvUrl} download>
              <Button variant="outline" size="sm">
                {t.resource.exportCsv}
              </Button>
            </a>
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
          <Card className="border-navy-300">
            <ResourceForm
              fields={createFields}
              onSubmit={(values) => {
                onCreate(values);
                setShowCreate(false);
              }}
              onCancel={() => setShowCreate(false)}
              pending={creating}
              error={createError}
              submitLabel={t.resource.create}
            />
          </Card>
        )}

        {editingRow && editFields && onUpdate && (
          <Card className="border-navy-300">
            <ResourceForm
              fields={editFields}
              initialValues={editFields.reduce<FormValues>((acc, f) => {
                const value = (editingRow as Record<string, unknown>)[f.name];
                if (typeof value === "boolean" || Array.isArray(value)) {
                  acc[f.name] = value as boolean | string[];
                } else {
                  acc[f.name] = value?.toString() ?? "";
                }
                return acc;
              }, {})}
              onSubmit={(values) => {
                onUpdate(editingRow.id, values);
                setEditingId(null);
              }}
              onCancel={() => setEditingId(null)}
              pending={Boolean(updating)}
              submitLabel={t.resource.save}
            />
          </Card>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-navy-200 text-left text-navy-500">
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
                  <td colSpan={columns.length + 1} className="py-4 text-center text-navy-400">
                    {t.resource.loading}
                  </td>
                </tr>
              )}
              {!isLoading && items.length === 0 && (
                <tr>
                  <td colSpan={columns.length + 1} className="py-4 text-center text-navy-400">
                    {t.resource.empty}
                  </td>
                </tr>
              )}
              {items.map((row) => (
                <tr key={row.id} className="border-b border-navy-100">
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

        <div className="flex items-center justify-between text-sm text-navy-500">
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
