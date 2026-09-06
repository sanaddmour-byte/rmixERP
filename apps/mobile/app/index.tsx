import * as React from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useGetHealth } from "@rmixerp/contract";
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
] as const;

const PRODUCTION_LINKS = [
  { module: "productionOrders", href: "/production-orders" },
  { module: "qc", href: "/qc" },
] as const;

function MasterDataLink({
  module,
  href,
}: {
  module:
    | (typeof MASTER_DATA_LINKS)[number]["module"]
    | (typeof SALES_LINKS)[number]["module"]
    | (typeof PRODUCTION_LINKS)[number]["module"];
  href: string;
}) {
  const { t } = useLanguage();
  const router = useRouter();
  const permissions = useModulePermissions(module);
  if (!permissions.view) return null;

  return (
    <Pressable onPress={() => router.push(href)} style={{ paddingVertical: 10 }}>
      <Text style={{ color: colors.accent, fontSize: 15 }}>{t.nav[module]}</Text>
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
              <MasterDataLink key={link.module} module={link.module} href={link.href} />
            ))}
          </View>

          <View>
            {PRODUCTION_LINKS.map((link) => (
              <MasterDataLink key={link.module} module={link.module} href={link.href} />
            ))}
          </View>

          <View>
            {MASTER_DATA_LINKS.map((link) => (
              <MasterDataLink key={link.module} module={link.module} href={link.href} />
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
