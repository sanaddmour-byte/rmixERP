import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { registerDevicePushToken } from "@rmixerp/contract";

/**
 * Requests notification permission and registers this device's Expo push
 * token with the API (Phase 10d) — called once after a successful login.
 * Real integration against `expo-notifications`'s documented API, matching
 * Phase 7's JoFotara-shell precedent: built against the published request/
 * response shape but never exercised against a live device or a configured
 * EAS project (no `extra.eas.projectId` is set in app.json yet). Every
 * failure here is caught and logged, never thrown or surfaced to the
 * caller — a missing push token must never block sign-in.
 */
export async function registerPushToken(): Promise<void> {
  try {
    if (!Device.isDevice) return; // simulators/emulators have no push capability
    if (Platform.OS !== "ios" && Platform.OS !== "android") return;

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== "granted") {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }
    if (status !== "granted") return;

    const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);

    await registerDevicePushToken({ token, platform: Platform.OS });
  } catch (err) {
    console.warn("registerPushToken failed (non-fatal):", err);
  }
}
