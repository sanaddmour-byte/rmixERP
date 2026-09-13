import type { Translations } from "@rmixerp/i18n";

export type NavGroupId = "sales" | "operations" | "procurement" | "finance" | "reports" | "admin";

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
    ],
  },
  {
    id: "procurement",
    labelKey: "procurement",
    icon: "package",
    items: [
      { href: "/raw-materials", labelKey: "rawMaterials", module: "rawMaterials", icon: "layers" },
      { href: "/vendors", labelKey: "vendors", module: "vendors", icon: "store" },
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
