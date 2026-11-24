import * as React from "react";
import { isSyncing, subscribeSyncActivity } from "./syncQueueActivity";

/** Re-renders whenever any queue item's in-flight state changes, so a screen can show "Syncing" live while this specific item is being replayed. */
export function useIsSyncing(id: string | undefined): boolean {
  return React.useSyncExternalStore(subscribeSyncActivity, () => (id ? isSyncing(id) : false));
}
