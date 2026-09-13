import { View } from "react-native";
import { Stack } from "expo-router";
import { NotificationsPanel } from "../../src/components/NotificationsPanel";
import { useRequireAuth } from "../../src/lib/useRequireAuth";

/**
 * QC Technician failure-alert inbox — see this batch fail on-site
 * (DOMAIN.md Invariant 6). A QC tech's permissions only ever cover
 * `qc_cube_test_failed`, so the shared cross-module panel naturally scopes
 * to QC alerts here without any type filter.
 */
export default function QCAlertsScreen() {
  const { ready } = useRequireAuth();

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Stack.Screen options={{ title: "QC Alerts" }} />
      <NotificationsPanel ready={ready} emptyLabel="No unread QC alerts." />
    </View>
  );
}
