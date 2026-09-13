import { View } from "react-native";
import { Stack } from "expo-router";
import { NotificationsPanel } from "../../src/components/NotificationsPanel";
import { useRequireAuth } from "../../src/lib/useRequireAuth";

/** Standalone entry point for the cross-module notification inbox (PLAN.md Phase 10c) -- the same panel embedded on the QC Alerts screen, for users whose notifications aren't QC-related (e.g. a purchasing approver with no reason to open QC). */
export default function NotificationsScreen() {
  const { ready } = useRequireAuth();

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Stack.Screen options={{ title: "Notifications" }} />
      <NotificationsPanel ready={ready} />
    </View>
  );
}
