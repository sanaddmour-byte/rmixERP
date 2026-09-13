import { Route, Switch } from "wouter";
import { Sidebar } from "./components/Sidebar";
import { HomePage } from "./routes/HomePage";
import { ReportsPage } from "./routes/ReportsPage";
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
import { InvoicesPage } from "./routes/InvoicesPage";
import { ClearanceQueuePage } from "./routes/ClearanceQueuePage";
import { CollectionsPage } from "./routes/CollectionsPage";
import { PostDatedChequesPage } from "./routes/PostDatedChequesPage";
import { ReceivablesReportsPage } from "./routes/ReceivablesReportsPage";
import { PurchaseRequestsPage } from "./routes/PurchaseRequestsPage";
import { PurchaseOrdersPage } from "./routes/PurchaseOrdersPage";
import { GoodsReceiptsPage } from "./routes/GoodsReceiptsPage";
import { VendorBillsPage } from "./routes/VendorBillsPage";
import { PaymentsPage } from "./routes/PaymentsPage";
import { ChartOfAccountsPage } from "./routes/ChartOfAccountsPage";
import { GLReportsPage } from "./routes/GLReportsPage";

export function App() {
  return (
    <div className="flex min-h-screen bg-navy-50 text-navy-900 dark:bg-navy-950 dark:text-navy-100">
      <Sidebar />
      <main className="min-w-0 flex-1 p-6">
        <Switch>
          <Route path="/login" component={LoginPage} />
          <Route path="/health" component={HealthPage} />
          <Route path="/reports" component={ReportsPage} />
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
          <Route path="/invoices" component={InvoicesPage} />
          <Route path="/clearance-queue" component={ClearanceQueuePage} />
          <Route path="/collections" component={CollectionsPage} />
          <Route path="/post-dated-cheques" component={PostDatedChequesPage} />
          <Route path="/receivables-reports" component={ReceivablesReportsPage} />
          <Route path="/purchase-requests" component={PurchaseRequestsPage} />
          <Route path="/purchase-orders" component={PurchaseOrdersPage} />
          <Route path="/goods-receipts" component={GoodsReceiptsPage} />
          <Route path="/vendor-bills" component={VendorBillsPage} />
          <Route path="/payments" component={PaymentsPage} />
          <Route path="/chart-of-accounts" component={ChartOfAccountsPage} />
          <Route path="/gl-reports" component={GLReportsPage} />
          <Route path="/" component={HomePage} />
        </Switch>
      </main>
    </div>
  );
}
