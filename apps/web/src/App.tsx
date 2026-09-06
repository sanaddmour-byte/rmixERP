import { Link, Route, Switch, useLocation } from "wouter";
import { Button } from "@rmixerp/ui";
import { useLanguage } from "./i18n/LanguageContext";
import { HealthPage } from "./routes/HealthPage";
import { LoginPage } from "./routes/LoginPage";
import { clearSession, getAccessToken } from "./lib/session";
import { useCurrentUser } from "./lib/useCurrentUser";

function Nav() {
  const { t, toggleLocale } = useLanguage();
  const [, navigate] = useLocation();
  const { data: currentUser } = useCurrentUser();

  function handleLogout() {
    clearSession();
    navigate("/login");
  }

  return (
    <nav className="flex items-center justify-between border-b border-slate-200 px-6 py-3">
      <span className="font-semibold">{t.appName}</span>
      <div className="flex items-center gap-4 text-sm">
        <Link href="/">{t.nav.health}</Link>
        {getAccessToken() && currentUser?.status === 200 ? (
          <>
            <span className="text-slate-500">{t.login.loggedInAs(currentUser.data.displayName)}</span>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              {t.login.logout}
            </Button>
          </>
        ) : (
          <Link href="/login">{t.nav.login}</Link>
        )}
        <Button variant="ghost" size="sm" onClick={toggleLocale}>
          {t.languageToggle}
        </Button>
      </div>
    </nav>
  );
}

export function App() {
  return (
    <div className="min-h-screen bg-slate-50">
      <Nav />
      <main className="p-6">
        <Switch>
          <Route path="/login" component={LoginPage} />
          <Route path="/" component={HealthPage} />
        </Switch>
      </main>
    </div>
  );
}
