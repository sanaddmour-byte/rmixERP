import * as React from "react";
import { useGetCompany, useUpdateCompany, type Company } from "@rmixerp/contract";
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from "@rmixerp/ui";
import { refetchOnSuccess } from "../lib/refetchOnSuccess";
import { useModulePermissions } from "../lib/usePermissions";

interface CompanyFormProps {
  company: Company;
  editable: boolean;
  onSave: (values: { name: string; taxNumber: string; documentExpiryWarningDays: number }) => void;
  saving: boolean;
}

/** Keyed by company.id in the parent so its local state re-initializes if the loaded company ever changes. */
function CompanyForm({ company, editable, onSave, saving }: CompanyFormProps) {
  const [name, setName] = React.useState(company.name);
  const [taxNumber, setTaxNumber] = React.useState(company.taxNumber ?? "");
  const [documentExpiryWarningDays, setDocumentExpiryWarningDays] = React.useState(String(company.documentExpiryWarningDays));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({ name, taxNumber, documentExpiryWarningDays: Number(documentExpiryWarningDays) || 30 });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        Name
        <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!editable} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Tax Number
        <Input value={taxNumber} onChange={(e) => setTaxNumber(e.target.value)} disabled={!editable} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Document-expiry warning window (days)
        <Input
          type="number"
          min={0}
          value={documentExpiryWarningDays}
          onChange={(e) => setDocumentExpiryWarningDays(e.target.value)}
          disabled={!editable}
        />
      </label>
      {editable && (
        <Button type="submit" disabled={saving}>
          Save
        </Button>
      )}
    </form>
  );
}

export function CompanyPage() {
  const permissions = useModulePermissions("company");
  const company = useGetCompany();
  const update = useUpdateCompany(refetchOnSuccess(company));

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Company Settings</CardTitle>
      </CardHeader>
      <CardContent>
        {company.isLoading && <p className="text-navy-500">Loading…</p>}
        {company.data?.status === 200 && (
          <CompanyForm
            key={company.data.data.id}
            company={company.data.data}
            editable={permissions.edit}
            saving={update.isPending}
            onSave={(values) =>
              update.mutate({ data: { name: values.name, taxNumber: values.taxNumber || null, documentExpiryWarningDays: values.documentExpiryWarningDays } })
            }
          />
        )}
      </CardContent>
    </Card>
  );
}
