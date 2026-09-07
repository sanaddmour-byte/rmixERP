import * as React from "react";
import { AppState, type AppStateStatus } from "react-native";
import { retryAllPending } from "./syncQueue";

/**
 * Sweeps the offline sync queue once at mount and again every time the app
 * returns to the foreground — the moment a device most plausibly just
 * regained signal after being backgrounded in the field.
 */
export function useSyncQueueAutoRetry(): void {
  React.useEffect(() => {
    void retryAllPending();
    const subscription = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active") void retryAllPending();
    });
    return () => subscription.remove();
  }, []);
}
