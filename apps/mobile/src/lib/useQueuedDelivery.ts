import * as React from "react";
import { useFocusEffect } from "expo-router";
import { findQueuedItemForDelivery, type SyncQueueItem } from "./syncQueue";
import { subscribeSyncActivity } from "./syncQueueActivity";

/**
 * The locally-queued proof-of-delivery item for one delivery, if any,
 * kept live: re-checked on screen focus (covers an app restart or
 * coming back from the Sync Queue screen) and whenever any item's
 * in-flight state changes (covers a background retry resolving while
 * this screen is already open).
 */
export function useQueuedDelivery(deliveryOrderId: string | undefined): { item: SyncQueueItem | null; refresh: () => void } {
  const [item, setItem] = React.useState<SyncQueueItem | null>(null);

  const refresh = React.useCallback(() => {
    if (!deliveryOrderId) {
      setItem(null);
      return;
    }
    void findQueuedItemForDelivery(deliveryOrderId).then(setItem);
  }, [deliveryOrderId]);

  useFocusEffect(
    React.useCallback(() => {
      refresh();
    }, [refresh]),
  );

  React.useEffect(() => subscribeSyncActivity(refresh), [refresh]);

  return { item, refresh };
}
