import * as React from "react";
import { useLocation } from "wouter";
import { useLogin } from "@rmixerp/contract";
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from "@rmixerp/ui";
import { useLanguage } from "../i18n/LanguageContext";
import { setSession } from "../lib/session";
import { useCurrentUser } from "../lib/useCurrentUser";

export function LoginPage() {
  const { t } = useLanguage();
  const [, navigate] = useLocation();
  const { refetch: refetchCurrentUser } = useCurrentUser();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const login = useLogin();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    login.mutate(
      { data: { email, password } },
      {
        onSuccess: (result) => {
          if (result.status === 200) {
            setSession(result.data.accessToken, result.data.refreshToken);
            void refetchCurrentUser();
            navigate("/");
            return;
          }
          setError(t.login.invalidCredentials);
        },
        onError: () => setError(t.login.invalidCredentials),
      },
    );
  }

  return (
    <Card className="max-w-sm">
      <CardHeader>
        <CardTitle>{t.login.title}</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-1 text-sm">
            {t.login.email}
            <Input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t.login.password}
            <Input
              type="password"
              autoComplete="current-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" disabled={login.isPending}>
            {login.isPending ? t.login.submitting : t.login.submit}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
