import * as React from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useGetHealth } from "@rmixerp/contract";
import type { Translations } from "@rmixerp/i18n";
import { useLanguage } from "../src/i18n/LanguageContext";
import { useModulePermissions } from "../src/lib/usePermissions";
import { useCurrentUser } from "../src/lib/useCurrentUser";
import { clearSession, getAccessToken } from "../src/lib/session";
import { colors } from "../src/theme";

const MASTER_DATA_LINKS = [
  { module: "customers", href: "/customers" },
  { module: "projects", href: "/projects" },
  { module: "products", href: "/products" },
  { module: "priceLists", href: "/price-lists" },
] as const;

const SALES_LINKS = [
  { module: "quotations", href: "/quotations" },
  { module: "salesOrders", href: "/sales-orders" },
  { module: "invoices", href: "/invoices" },
] as const;

const PRODUCTION_LINKS = [
  { module: "productionOrders", href: "/production-orders" },
  { module: "qc", href: "/qc" },
] as const;

// Both gated on the same `deliveryOrders` permission module — a dispatcher
// works the planner list, a driver works their own assigned-deliveries
// list, so the label is overridden per link rather than derived from the
// module name.
const DISPATCH_LINKS = [
  { module: "deliveryOrders", href: "/dispatch", labelKey: "dispatch" },
  { module: "deliveryOrders", href: "/deliveries", labelKey: "myDeliveries" },
  // The sync queue only ever holds proof-of-delivery submissions today
  // (syncQueue.ts), so it's gated the same as the delivery screens above
  // rather than getting its own permission module.
  { module: "deliveryOrders", href: "/sync-queue", labelKey: "syncQueue" },
] as const;

// Collectors' field screens (DOMAIN.md/PLAN.md's mobile-critical Phase 8
// scope). PDC lifecycle management (deposit/clear/bounce/cancel) and the
// aging/credit-control/credit-overrides reports stay web-only — see
// docs/PLAN.md's Phase 8 entry.
const RECEIVABLES_LINKS = [
  { module: "collections", href: "/collections", labelKey: "collections" },
  { module: "receivablesReports", href: "/customer-statement", labelKey: "customerStatement" },
] as const;

// Procurement/approvers' field screens (PLAN.md's Phase 9 mobile scope):
// PR/PO create + approve/reject, and goods-receipt capture (reached from a
// PO's own detail screen once approved, matching deliveries/[id]'s proof-
// of-delivery pattern rather than a separate home entry). Vendor bills,
// payments, chart of accounts, and GL reports stay web-only/back-office.
const PROCUREMENT_LINKS = [
  { module: "purchaseRequests", href: "/purchase-requests", labelKey: "purchaseRequests" },
  { module: "purchaseOrders", href: "/purchase-orders", labelKey: "purchaseOrders" },
] as const;

// Phase 10's cross-cutting screens. Approvals is gated on purchaseOrders
// view as a reasonable proxy for "this user approves things" — the screen
// itself scopes its actual contents to the caller's real per-module
// :approve permissions, which a single link-level gate can't express.
// Fleet Alerts is read-only on mobile (editing trucks/drivers stays
// web-only, matching every other master-data screen).
const OPS_LINKS = [
  { module: "purchaseOrders", href: "/approvals", labelKey: "approvalsInbox" },
  { module: "trucks", href: "/fleet-alerts", labelKey: "fleetAlerts" },
  // Same proxy-gate trade-off as Approvals above — qc:view picked as the
  // broadest-held of the three notification-producing modules.
  { module: "qc", href: "/notifications", labelKey: "notifications" },
] as const;

type LinkModule =
  | (typeof MASTER_DATA_LINKS)[number]["module"]
  | (typeof SALES_LINKS)[number]["module"]
  | (typeof PRODUCTION_LINKS)[number]["module"]
  | (typeof DISPATCH_LINKS)[number]["module"]
  | (typeof RECEIVABLES_LINKS)[number]["module"]
  | (typeof PROCUREMENT_LINKS)[number]["module"]
  | (typeof OPS_LINKS)[number]["module"];

function MasterDataLink({
  module,
  href,
  labelKey,
}: {
  module: LinkModule;
  href: string;
  labelKey: keyof Translations["nav"];
}) {
  const { t } = useLanguage();
  const router = useRouter();
  const permissions = useModulePermissions(module);
  if (!permissions.view) return null;

  return (
    <Pressable onPress={() => router.push(href)} style={{ paddingVertical: 10 }}>
      <Text style={{ color: colors.accent, fontSize: 15 }}>{t.nav[labelKey]}</Text>
    </Pressable>
  );
}

export default function HealthScreen() {
  const { t, locale, setLocale } = useLanguage();
  const router = useRouter();
  const health = useGetHealth();
  const { data: currentUser } = useCurrentUser();
  const signedIn = Boolean(getAccessToken()) && currentUser?.status === 200;

  async function handleSignOut() {
    await clearSession();
    router.replace("/login");
  }

  return (
    <View style={{ flex: 1, padding: 24, gap: 16 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ fontSize: 20, fontWeight: "600", color: colors.navy }}>{t.appName}</Text>
        <Pressable onPress={() => setLocale(locale === "en" ? "ar" : "en")}>
          <Text style={{ color: colors.accent }}>{t.languageToggle}</Text>
        </Pressable>
      </View>

      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 16, fontWeight: "600", color: colors.navy }}>{t.health.title}</Text>
        {health.isLoading && <ActivityIndicator />}
        {health.isError && <Text style={{ color: colors.danger }}>{t.health.error}</Text>}
        {health.data && (
          <>
            <Text style={{ color: colors.success }}>{t.health.ok}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>
              {t.health.lastChecked(health.data.data.time)}
            </Text>
          </>
        )}
      </View>

      {signedIn && currentUser?.status === 200 ? (
        <>
          <View style={{ gap: 8 }}>
            <Text style={{ color: colors.textMuted }}>{t.login.loggedInAs(currentUser.data.displayName)}</Text>
            <Pressable onPress={() => void handleSignOut()}>
              <Text style={{ color: colors.danger }}>{t.login.logout}</Text>
            </Pressable>
          </View>

          <View>
            {SALES_LINKS.map((link) => (
              <MasterDataLink key={link.module} module={link.module} href={link.href} labelKey={link.module} />
            ))}
          </View>

          <View>
            {PRODUCTION_LINKS.map((link) => (
              <MasterDataLink key={link.module} module={link.module} href={link.href} labelKey={link.module} />
            ))}
          </View>

          <View>
            {DISPATCH_LINKS.map((link) => (
              <MasterDataLink key={link.href} module={link.module} href={link.href} labelKey={link.labelKey} />
            ))}
          </View>

          <View>
            {RECEIVABLES_LINKS.map((link) => (
              <MasterDataLink key={link.href} module={link.module} href={link.href} labelKey={link.labelKey} />
            ))}
          </View>

          <View>
            {PROCUREMENT_LINKS.map((link) => (
              <MasterDataLink key={link.href} module={link.module} href={link.href} labelKey={link.labelKey} />
            ))}
          </View>

          <View>
            {OPS_LINKS.map((link) => (
              <MasterDataLink key={link.href} module={link.module} href={link.href} labelKey={link.labelKey} />
            ))}
          </View>

          <View>
            {MASTER_DATA_LINKS.map((link) => (
              <MasterDataLink key={link.module} module={link.module} href={link.href} labelKey={link.module} />
            ))}
          </View>
        </>
      ) : (
        <Pressable onPress={() => router.push("/login")}>
          <Text style={{ color: colors.accent }}>{t.nav.login}</Text>
        </Pressable>
      )}
    </View>
  );
}
