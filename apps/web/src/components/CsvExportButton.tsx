import * as React from "react";
import { Button } from "@rmixerp/ui";
import { downloadCsv } from "../lib/downloadCsv";
import { useLanguage } from "../i18n/LanguageContext";

/** Shared "Export CSV" button for the handful of report sections that aren't built on `ResourceListPage` — same authenticated-download fix, same pattern. */
export function CsvExportButton({ url, filename }: { url: string; filename: string }) {
  const { t } = useLanguage();
  const [exporting, setExporting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleClick() {
    setExporting(true);
    setError(null);
    const result = await downloadCsv(url, filename);
    if (!result.ok) setError(result.error);
    setExporting(false);
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-orange-700">{error}</span>}
      <Button size="sm" variant="outline" disabled={exporting} onClick={() => void handleClick()}>
        {exporting ? t.resource.exporting : t.resource.exportCsv}
      </Button>
    </div>
  );
}
