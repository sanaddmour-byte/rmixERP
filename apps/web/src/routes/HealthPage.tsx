import { useGetHealth } from "@rmixerp/contract";
import { Card, CardContent, CardHeader, CardTitle } from "@rmixerp/ui";
import { useLanguage } from "../i18n/LanguageContext";

export function HealthPage() {
  const { t } = useLanguage();
  const { data, isLoading, isError } = useGetHealth();

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>{t.health.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading && <p className="text-navy-500">{t.health.checking}</p>}
        {isError && <p className="text-red-600 dark:text-red-400">{t.health.error}</p>}
        {data && data.status === 200 && (
          <>
            <p className="font-medium text-green-700">{t.health.ok}</p>
            <p className="text-sm text-navy-500 dark:text-navy-400">{t.health.lastChecked(data.data.time)}</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
