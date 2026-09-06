import "../src/lib/session";
import * as React from "react";
import { ActivityIndicator, View } from "react-native";
import { Stack } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { LanguageProvider } from "../src/i18n/LanguageContext";
import { loadSessionFromStorage } from "../src/lib/session";

const queryClient = new QueryClient();

export default function RootLayout() {
  const [sessionReady, setSessionReady] = React.useState(false);

  React.useEffect(() => {
    void loadSessionFromStorage().finally(() => setSessionReady(true));
  }, []);

  if (!sessionReady) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <LanguageProvider>
          <StatusBar style="auto" />
          <Stack screenOptions={{ headerTitleAlign: "center" }} />
        </LanguageProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
