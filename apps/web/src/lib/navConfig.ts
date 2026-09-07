import type { Translations } from "@rmixerp/i18n";

export type NavGroupId = "approvals" | "sales" | "operations" | "procurement" | "finance" | "reports" | "admin";

export interface NavItem {
  href: string;
  labelKey: keyof Translations["nav"];
  /** Permission module gating visibility — reuses each page's existing `module:view` check. */
  module: string;
  icon: string;
}

export interface NavGroup {
  id: NavGroupId;
  labelKey: keyof Translations["navGroups"];
  icon: string;
  items: NavItem[];
}

/**
 * Single source of truth for the app's information architecture — the
 * sidebar, the Odoo-style home dashboard, and (for finance) the reports
 * hub all render from this list rather than each keeping their own copy.
 * `icon` keys map to `../components/icons.tsx`.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: "approvals",
    labelKey: "approvals",
    icon: "checkCircle",
    items: [
      // Gated on purchaseOrders:view as a reasonable proxy for "this user
      // approves things" — the page itself scopes its actual contents to
      // whichever of purchaseRequests/purchaseOrders/vendorBills:approve
      // the signed-in user actually holds, which a single NavItem module
      // gate can't express directly.
      { href: "/approvals", labelKey: "approvalsInbox", module: "purchaseOrders", icon: "checkCircle" },
      // Same proxy-gate trade-off as approvalsInbox above: the page itself
      // scopes its contents to whichever notification types this user's
      // permissions actually cover (qc:view, purchaseRequests:approve,
      // purchaseOrders:approve), which a single NavItem module gate can't
      // express -- qc:view is picked here as the broadest-held of the three.
      { href: "/notifications", labelKey: "notifications", module: "qc", icon: "bell" },
    ],
  },
  {
    id: "sales",
    labelKey: "sales",
    icon: "briefcase",
    items: [
      { href: "/customers", labelKey: "customers", module: "customers", icon: "users" },
      { href: "/projects", labelKey: "projects", module: "projects", icon: "folder" },
      { href: "/products", labelKey: "products", module: "products", icon: "box" },
      { href: "/price-lists", labelKey: "priceLists", module: "priceLists", icon: "tag" },
      { href: "/charge-types", labelKey: "chargeTypes", module: "chargeTypes", icon: "percent" },
      { href: "/quotations", labelKey: "quotations", module: "quotations", icon: "fileText" },
      { href: "/sales-orders", labelKey: "salesOrders", module: "salesOrders", icon: "cart" },
    ],
  },
  {
    id: "operations",
    labelKey: "operations",
    icon: "layers",
    items: [
      { href: "/mix-designs", labelKey: "mixDesigns", module: "mixDesigns", icon: "flask" },
      { href: "/inventory", labelKey: "inventory", module: "inventory", icon: "database" },
      { href: "/production-orders", labelKey: "productionOrders", module: "productionOrders", icon: "clipboard" },
      { href: "/qc", labelKey: "qc", module: "qc", icon: "checkCircle" },
      { href: "/trucks", labelKey: "trucks", module: "trucks", icon: "truck" },
      { href: "/drivers", labelKey: "drivers", module: "drivers", icon: "idCard" },
      { href: "/dispatch", labelKey: "dispatch", module: "deliveryOrders", icon: "calendar" },
      { href: "/fleet-alerts", labelKey: "fleetAlerts", module: "trucks", icon: "fileClock" },
    ],
  },
  {
    id: "procurement",
    labelKey: "procurement",
    icon: "package",
    items: [
      { href: "/raw-materials", labelKey: "rawMaterials", module: "rawMaterials", icon: "layers" },
      { href: "/vendors", labelKey: "vendors", module: "vendors", icon: "store" },
      { href: "/purchase-requests", labelKey: "purchaseRequests", module: "purchaseRequests", icon: "fileText" },
      { href: "/purchase-orders", labelKey: "purchaseOrders", module: "purchaseOrders", icon: "clipboard" },
      { href: "/goods-receipts", labelKey: "goodsReceipts", module: "goodsReceipts", icon: "box" },
      { href: "/vendor-bills", labelKey: "vendorBills", module: "vendorBills", icon: "receipt" },
    ],
  },
  {
    id: "finance",
    labelKey: "finance",
    icon: "wallet",
    items: [
      { href: "/invoices", labelKey: "invoices", module: "invoices", icon: "receipt" },
      { href: "/clearance-queue", labelKey: "clearanceQueue", module: "clearance", icon: "shield" },
      { href: "/collections", labelKey: "collections", module: "collections", icon: "creditCard" },
      { href: "/post-dated-cheques", labelKey: "postDatedCheques", module: "postDatedCheques", icon: "fileClock" },
      { href: "/payments", labelKey: "payments", module: "payments", icon: "creditCard" },
      { href: "/chart-of-accounts", labelKey: "chartOfAccounts", module: "glAccounts", icon: "database" },
      { href: "/gl-reports", labelKey: "glReports", module: "glReports", icon: "barChart" },
    ],
  },
  {
    id: "reports",
    labelKey: "reports",
    icon: "barChart",
    items: [{ href: "/reports", labelKey: "reports", module: "receivablesReports", icon: "barChart" }],
  },
  {
    id: "admin",
    labelKey: "administration",
    icon: "settings",
    items: [
      { href: "/company", labelKey: "company", module: "company", icon: "building" },
      { href: "/branches", labelKey: "branches", module: "branches", icon: "mapPin" },
      { href: "/users", labelKey: "users", module: "users", icon: "user" },
      { href: "/roles", labelKey: "roles", module: "roles", icon: "key" },
    ],
  },
];
