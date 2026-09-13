import { Link, Route, Switch, useLocation } from "wouter";
import type { Translations } from "@rmixerp/i18n";
import { Button } from "@rmixerp/ui";
import { useLanguage } from "./i18n/LanguageContext";
import { HealthPage } from "./routes/HealthPage";
import { LoginPage } from "./routes/LoginPage";
import { CompanyPage } from "./routes/CompanyPage";
import { BranchesPage } from "./routes/BranchesPage";
import { UsersPage } from "./routes/UsersPage";
import { RolesPage } from "./routes/RolesPage";
import { CustomersPage } from "./routes/CustomersPage";
import { ProjectsPage } from "./routes/ProjectsPage";
import { ProductsPage } from "./routes/ProductsPage";
import { PriceListsPage } from "./routes/PriceListsPage";
import { ChargeTypesPage } from "./routes/ChargeTypesPage";
import { RawMaterialsPage } from "./routes/RawMaterialsPage";
import { VendorsPage } from "./routes/VendorsPage";
import { QuotationsPage } from "./routes/QuotationsPage";
import { SalesOrdersPage } from "./routes/SalesOrdersPage";
import { MixDesignsPage } from "./routes/MixDesignsPage";
import { InventoryPage } from "./routes/InventoryPage";
import { ProductionOrdersPage } from "./routes/ProductionOrdersPage";
import { QCPage } from "./routes/QCPage";
import { TrucksPage } from "./routes/TrucksPage";
import { DriversPage } from "./routes/DriversPage";
import { DispatchPage } from "./routes/DispatchPage";
import { clearSession, getAccessToken } from "./lib/session";
import { useCurrentUser } from "./lib/useCurrentUser";

const MASTER_DATA_LINKS: { href: string; labelKey: keyof Translations["nav"] }[] = [
  { href: "/company", labelKey: "company" },
  { href: "/branches", labelKey: "branches" },
  { href: "/users", labelKey: "users" },
  { href: "/roles", labelKey: "roles" },
  { href: "/customers", labelKey: "customers" },
  { href: "/projects", labelKey: "projects" },
  { href: "/products", labelKey: "products" },
  { href: "/price-lists", labelKey: "priceLists" },
  { href: "/charge-types", labelKey: "chargeTypes" },
  { href: "/raw-materials", labelKey: "rawMaterials" },
  { href: "/vendors", labelKey: "vendors" },
  { href: "/quotations", labelKey: "quotations" },
  { href: "/sales-orders", labelKey: "salesOrders" },
  { href: "/mix-designs", labelKey: "mixDesigns" },
  { href: "/inventory", labelKey: "inventory" },
  { href: "/production-orders", labelKey: "productionOrders" },
  { href: "/qc", labelKey: "qc" },
  { href: "/trucks", labelKey: "trucks" },
  { href: "/drivers", labelKey: "drivers" },
  { href: "/dispatch", labelKey: "dispatch" },
];

function Nav() {
  const { t, toggleLocale } = useLanguage();
  const [, navigate] = useLocation();
  const { data: currentUser } = useCurrentUser();
  const signedIn = Boolean(getAccessToken()) && currentUser?.status === 200;

  function handleLogout() {
    clearSession();
    navigate("/login");
  }

  return (
    <nav className="bg-navy-900">
      <div className="flex items-center justify-between px-6 py-3">
        <span className="font-semibold text-white">
          {t.appName}
          <span className="text-orange-400">.</span>
        </span>
        <div className="flex items-center gap-4 text-sm text-navy-100">
          <Link href="/" className="hover:text-orange-400">
            {t.nav.health}
          </Link>
          {signedIn && currentUser?.status === 200 ? (
            <>
              <span className="text-navy-300">{t.login.loggedInAs(currentUser.data.displayName)}</span>
              <Button
                variant="outline"
                size="sm"
                className="border-navy-600 bg-transparent text-white hover:bg-navy-800"
                onClick={handleLogout}
              >
                {t.login.logout}
              </Button>
            </>
          ) : (
            <Link href="/login" className="hover:text-orange-400">
              {t.nav.login}
            </Link>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="text-navy-100 hover:bg-navy-800 hover:text-orange-400"
            onClick={toggleLocale}
          >
            {t.languageToggle}
          </Button>
        </div>
      </div>
      {signedIn && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-navy-700 bg-navy-800 px-6 py-2 text-xs text-navy-200">
          {MASTER_DATA_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-orange-400">
              {t.nav[link.labelKey]}
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
}

export function App() {
  return (
    <div className="min-h-screen bg-navy-50">
      <Nav />
      <main className="p-6">
        <Switch>
          <Route path="/login" component={LoginPage} />
          <Route path="/company" component={CompanyPage} />
          <Route path="/branches" component={BranchesPage} />
          <Route path="/users" component={UsersPage} />
          <Route path="/roles" component={RolesPage} />
          <Route path="/customers" component={CustomersPage} />
          <Route path="/projects" component={ProjectsPage} />
          <Route path="/products" component={ProductsPage} />
          <Route path="/price-lists" component={PriceListsPage} />
          <Route path="/charge-types" component={ChargeTypesPage} />
          <Route path="/raw-materials" component={RawMaterialsPage} />
          <Route path="/vendors" component={VendorsPage} />
          <Route path="/quotations" component={QuotationsPage} />
          <Route path="/sales-orders" component={SalesOrdersPage} />
          <Route path="/mix-designs" component={MixDesignsPage} />
          <Route path="/inventory" component={InventoryPage} />
          <Route path="/production-orders" component={ProductionOrdersPage} />
          <Route path="/qc" component={QCPage} />
          <Route path="/trucks" component={TrucksPage} />
          <Route path="/drivers" component={DriversPage} />
          <Route path="/dispatch" component={DispatchPage} />
          <Route path="/" component={HealthPage} />
        </Switch>
      </main>
    </div>
  );
}
