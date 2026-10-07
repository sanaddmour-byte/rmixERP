import * as React from "react";
import { Button, Card, CardContent, CardHeader, CardTitle, ConfirmDialog, Input, TableSkeleton } from "@rmixerp/ui";
import { useLanguage } from "../i18n/LanguageContext";
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
  /** Awaited: the panel only closes once this resolves, and stays open with the error shown (data intact) if it rejects — see docs/ui-ux-audit.md §4/§9. */
  onSubmit: (values: FormValues) => Promise<unknown>;
  onCancel: () => void;
  submitLabel: string;
}

function ResourceForm({ fields, initialValues, onSubmit, onCancel, submitLabel }: ResourceFormProps) {
  const [values, setValues] = React.useState<FormValues>(() => initialValues ?? {});
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const errorId = React.useId();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = await onSubmit(values);
      throwIfApiError(result);
      // onCancel just unmounts this form — reused here for "close on success" too, since the parent owns the open/closed state either way.
      onCancel();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this — please check the fields and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 p-4">
      {fields.map((field) => {
        const fieldErrorId = `${errorId}-${field.name}`;
        return (
          <label key={field.name} className="flex flex-col gap-1 text-sm">
            <span>
              {field.label}
              {field.required && (
                <span className="ms-0.5 text-danger" aria-hidden="true">
                  *
                </span>
              )}
            </span>
            {field.type === "select" ? (
              <select
                className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-text"
                required={field.required}
                value={typeof values[field.name] === "string" ? (values[field.name] as string) : ""}
                onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value }))}
                aria-invalid={error ? true : undefined}
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
              <div className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-md border border-border p-2">
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
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? fieldErrorId : undefined}
              />
            )}
          </label>
        );
      })}
      {error && (
        <p id={errorId} role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
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
  /** Must reject on failure (pass create.mutateAsync, not create.mutate) — the form only closes on success. */
  onCreate: (values: FormValues) => Promise<unknown>;
  editFields?: FieldConfig[];
  onUpdate?: (id: string, values: FormValues) => Promise<unknown>;
  onVoid: (id: string) => void;
  voiding: boolean;
  permissions: { create: boolean; edit: boolean; void: boolean };
  /** Contextual copy for the empty state ("No customers yet. Create your first customer to..."), shown instead of the generic fallback. */
  emptyState?: { title: string; description?: string };
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
  editFields,
  onUpdate,
  onVoid,
  voiding,
  permissions,
  emptyState,
}: ResourceListPageProps<T>) {
  const { t } = useLanguage();
  const [showCreate, setShowCreate] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [confirmVoidId, setConfirmVoidId] = React.useState<string | null>(null);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const editingRow = items.find((i) => i.id === editingId);
  const voidingRow = items.find((i) => i.id === confirmVoidId);

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
          <Card className="border-border bg-surface-raised">
            <ResourceForm fields={createFields} onSubmit={onCreate} onCancel={() => setShowCreate(false)} submitLabel={t.resource.create} />
          </Card>
        )}

        {editingRow && editFields && onUpdate && (
          <Card className="border-border bg-surface-raised">
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
              onSubmit={(values) => onUpdate(editingRow.id, values)}
              onCancel={() => setEditingId(null)}
              submitLabel={t.resource.save}
            />
          </Card>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-start text-text-muted">
                {columns.map((col) => (
                  <th key={String(col.key)} className="py-2 pe-4 font-medium">
                    {col.header}
                  </th>
                ))}
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {isLoading && <TableSkeleton columns={columns.length + 1} />}
              {!isLoading && items.length === 0 && (
                <tr>
                  <td colSpan={columns.length + 1} className="py-8 text-center">
                    <p className="font-medium text-text">{emptyState?.title ?? t.resource.empty}</p>
                    {emptyState?.description && <p className="mt-1 text-sm text-text-muted">{emptyState.description}</p>}
                  </td>
                </tr>
              )}
              {items.map((row) => (
                <tr key={row.id} className="border-b border-border/60">
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
                        <Button variant="ghost" size="sm" disabled={voiding} onClick={() => setConfirmVoidId(row.id)}>
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

        <div className="flex items-center justify-between text-sm text-text-muted">
          <span>{t.resource.pageOf(page, totalPages, total)}</span>
          <div className="flex gap-2 rtl:flex-row-reverse">
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

      <ConfirmDialog
        open={confirmVoidId !== null}
        title={t.resource.confirmRemove}
        itemLabel={voidingRow ? String((voidingRow as Record<string, unknown>).name ?? (voidingRow as Record<string, unknown>).code ?? voidingRow.id) : undefined}
        confirmLabel={t.resource.remove}
        pending={voiding}
        onConfirm={() => {
          if (confirmVoidId) onVoid(confirmVoidId);
          setConfirmVoidId(null);
        }}
        onCancel={() => setConfirmVoidId(null)}
      />
    </Card>
  );
}
