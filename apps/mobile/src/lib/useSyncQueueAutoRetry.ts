import * as React from "react";
import { AppState, type AppStateStatus } from "react-native";
import { listQueue, retryAllPending } from "./syncQueue";

const POLL_INTERVAL_MS = 30_000;

/**
 * Sweeps the offline sync queue at mount, every time the app returns to
 * the foreground (the moment a device most plausibly just regained
 * signal after being backgrounded in the field), and — while anything
 * is actually queued — every 30s on a plain interval. The interval
 * matters for the case app-foreground alone misses: a driver's app
 * stays open and in the foreground the whole time they drive through a
 * dead zone, so there's no foreground transition to hang a retry off of
 * when signal comes back; this has no real connectivity signal to react
 * to (no NetInfo-equivalent dependency in this app), so a bounded poll
 * is the deliberate, lower-risk stand-in rather than adding a new
 * native module this change can't verify on a real device.
 */
export function useSyncQueueAutoRetry(): void {
  React.useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function sweep() {
      if (cancelled) return;
      await retryAllPending();
      if (cancelled) return;
      const remaining = await listQueue();
      if (cancelled) return;
      if (remaining.some((item) => item.status !== "conflict")) {
        timer = setTimeout(() => void sweep(), POLL_INTERVAL_MS);
      }
    }

    void sweep();
    const subscription = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active") void sweep();
    });
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      subscription.remove();
    };
  }, []);
}
