import * as React from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useGetHealth } from "@rmixerp/contract";
import { useLanguage } from "../src/i18n/LanguageContext";
import { useCurrentUser } from "../src/lib/useCurrentUser";
import { clearSession, getAccessToken } from "../src/lib/session";

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
        <Text style={{ fontSize: 20, fontWeight: "600" }}>{t.appName}</Text>
        <Pressable onPress={() => setLocale(locale === "en" ? "ar" : "en")}>
          <Text style={{ color: "#2563eb" }}>{t.languageToggle}</Text>
        </Pressable>
      </View>

      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 16, fontWeight: "600" }}>{t.health.title}</Text>
        {health.isLoading && <ActivityIndicator />}
        {health.isError && <Text style={{ color: "#dc2626" }}>{t.health.error}</Text>}
        {health.data && (
          <>
            <Text style={{ color: "#15803d" }}>{t.health.ok}</Text>
            <Text style={{ color: "#64748b", fontSize: 12 }}>
              {t.health.lastChecked(health.data.data.time)}
            </Text>
          </>
        )}
      </View>

      {signedIn && currentUser?.status === 200 ? (
        <View style={{ gap: 8 }}>
          <Text style={{ color: "#64748b" }}>{t.login.loggedInAs(currentUser.data.displayName)}</Text>
          <Pressable onPress={() => void handleSignOut()}>
            <Text style={{ color: "#dc2626" }}>{t.login.logout}</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable onPress={() => router.push("/login")}>
          <Text style={{ color: "#2563eb" }}>{t.nav.login}</Text>
        </Pressable>
      )}
    </View>
  );
}
