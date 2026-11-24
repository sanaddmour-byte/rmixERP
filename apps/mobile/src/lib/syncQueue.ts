import AsyncStorage from "@react-native-async-storage/async-storage";
import { deliverDeliveryOrder, getDeliveryOrder, type DeliverDeliveryOrderRequest, type ProofOfDelivery } from "@rmixerp/contract";
import { markSyncing, markSyncSettled } from "./syncQueueActivity";

const STORAGE_KEY = "rmixerp-sync-queue";

export type SyncQueueStatus = "pending" | "failed" | "conflict";

/**
 * Only one mutation kind is wired to the queue so far — proof-of-delivery
 * submission, the field/offline scenario DOMAIN.md calls out explicitly
 * (a driver signing a delivery with no signal). Retrofitting every other
 * mobile mutation onto this queue is scoped-out follow-up, documented in
 * docs/PLAN.md's Phase 10 entry rather than attempted here; the `kind`
 * discriminator and `replayItem`'s switch exist so adding one is additive.
 */
export type SyncQueueKind = "deliverProofOfDelivery";

export interface DeliverProofOfDeliveryPayload {
  deliveryOrderId: string;
  request: DeliverDeliveryOrderRequest;
}

export interface SyncQueueItem {
  id: string;
  kind: SyncQueueKind;
  payload: DeliverProofOfDeliveryPayload;
  status: SyncQueueStatus;
  attempts: number;
  createdAt: string;
  lastAttemptAt: string | null;
  lastError: string | null;
}

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function loadQueue(): Promise<SyncQueueItem[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SyncQueueItem[]) : [];
  } catch {
    return [];
  }
}

async function saveQueue(items: SyncQueueItem[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export async function listQueue(): Promise<SyncQueueItem[]> {
  return loadQueue();
}

/** The one queued proof-of-delivery item for a given delivery, if any — lets a delivery's own screens reflect its real local-sync state instead of only the separate Sync Queue screen knowing about it. */
export async function findQueuedItemForDelivery(deliveryOrderId: string): Promise<SyncQueueItem | null> {
  const items = await loadQueue();
  return items.find((i) => i.kind === "deliverProofOfDelivery" && i.payload.deliveryOrderId === deliveryOrderId) ?? null;
}

/**
 * Queues a proof-of-delivery submission that failed with a genuine
 * transport error (see `replayItem`'s doc comment on what counts as one).
 * Persists immediately so the item survives an app restart before the
 * next retry.
 */
export async function enqueueProofOfDelivery(payload: DeliverProofOfDeliveryPayload): Promise<SyncQueueItem> {
  const items = await loadQueue();
  const item: SyncQueueItem = {
    id: generateId(),
    kind: "deliverProofOfDelivery",
    payload,
    status: "pending",
    attempts: 0,
    createdAt: new Date().toISOString(),
    lastAttemptAt: null,
    lastError: null,
  };
  await saveQueue([...items, item]);
  return item;
}

export async function discardItem(id: string): Promise<void> {
  const items = await loadQueue();
  await saveQueue(items.filter((i) => i.id !== id));
}

type ReplayOutcome = "synced" | "network_error" | "conflict";

/** Does the server's stored proof of delivery match what this queued item tried to submit — i.e. this device's own earlier attempt, not someone/something else's. */
function podMatchesOwnSubmission(pod: ProofOfDelivery, request: DeliverDeliveryOrderRequest): boolean {
  return pod.signedByName === request.signedByName && pod.receivedQuantityM3 === request.receivedQuantityM3 && pod.signatureData === request.signatureData;
}

/**
 * Replays one queued item against the real API. A thrown error here is,
 * by `packages/contract/src/http-client.ts`'s own contract, a genuine
 * transport failure (still offline, or offline again) — the item stays
 * queued for a later retry. Any HTTP response the API actually returns,
 * 200 included, resolves normally rather than throwing.
 *
 * A non-200 here doesn't necessarily mean a genuine conflict: the
 * delivery can already be "delivered" because our own earlier attempt's
 * *request* reached the server and succeeded, but its *response* never
 * reached this device (the connection dropped mid-flight, the app was
 * killed before it could persist the outcome, etc.) — not a real
 * problem, just an uncertain outcome that needs reconciling before we
 * either retry-and-risk-a-duplicate or scare the driver with a false
 * conflict. Fetch the delivery's current state and compare its stored
 * proof of delivery against what this item tried to submit: an exact
 * match means it already succeeded, so treat it as synced; anything
 * else (a different signer/quantity, or still not delivered) is a
 * genuine conflict for a human to look at, never retried automatically.
 */
async function replayItem(item: SyncQueueItem): Promise<{ outcome: ReplayOutcome; error?: string }> {
  try {
    const result = await deliverDeliveryOrder(item.payload.deliveryOrderId, item.payload.request);
    if (result.status === 200) return { outcome: "synced" };

    const current = await getDeliveryOrder(item.payload.deliveryOrderId).catch(() => null);
    const pod = current?.status === 200 ? current.data.proofOfDelivery : null;
    if (pod && podMatchesOwnSubmission(pod, item.payload.request)) {
      return { outcome: "synced" };
    }
    return { outcome: "conflict", error: result.data.error.message };
  } catch (err) {
    return { outcome: "network_error", error: err instanceof Error ? err.message : String(err) };
  }
}

/** Retries one item by id, updating its persisted status in place. Returns the outcome so a caller (e.g. the Sync Queue screen) can react without re-reading the whole list. */
export async function retryItem(id: string): Promise<ReplayOutcome | null> {
  const items = await loadQueue();
  const index = items.findIndex((i) => i.id === id);
  if (index === -1) return null;
  const item = items[index];
  if (!item) return null;

  markSyncing(id);
  const { outcome, error } = await replayItem(item).finally(() => markSyncSettled(id));
  if (outcome === "synced") {
    await saveQueue(items.filter((i) => i.id !== id));
    return outcome;
  }

  const updated: SyncQueueItem = {
    ...item,
    status: outcome === "conflict" ? "conflict" : "failed",
    attempts: item.attempts + 1,
    lastAttemptAt: new Date().toISOString(),
    lastError: error ?? null,
  };
  const next = [...items];
  next[index] = updated;
  await saveQueue(next);
  return outcome;
}

/** Auto-retry sweep (app-foreground trigger): replays every pending/failed item, skipping items already marked `conflict` since those need a human decision, not another automatic attempt. */
export async function retryAllPending(): Promise<void> {
  const items = await loadQueue();
  for (const item of items) {
    if (item.status === "conflict") continue;
    await retryItem(item.id);
  }
}
