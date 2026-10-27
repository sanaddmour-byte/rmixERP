import * as React from "react";
import { useLocation } from "wouter";
import { useLogin } from "@rmixerp/contract";
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from "@rmixerp/ui";
import { useLanguage } from "../i18n/LanguageContext";
import { setSession } from "../lib/session";
import { useCurrentUser } from "../lib/useCurrentUser";
import loginHero from "../assets/login-hero.png";

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
    <div className="mx-auto flex max-w-4xl overflow-hidden rounded-xl border border-navy-200 bg-white shadow-sm dark:border-navy-800 dark:bg-navy-900">
      <div className="relative hidden w-80 shrink-0 md:block">
        <img src={loginHero} alt="" role="presentation" className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-navy-950/85 via-navy-950/10 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-6">
          <p className="text-lg font-semibold text-white">{t.appName}</p>
          <p className="mt-1 text-sm text-navy-100">{t.login.tagline}</p>
        </div>
      </div>
      <Card className="w-full max-w-sm flex-1 rounded-none border-0 shadow-none">
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
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            <Button type="submit" disabled={login.isPending}>
              {login.isPending ? t.login.submitting : t.login.submit}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
