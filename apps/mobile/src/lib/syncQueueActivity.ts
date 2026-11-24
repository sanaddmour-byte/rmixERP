/**
 * Transient, in-memory "is this queue item being replayed right now"
 * tracker — deliberately not persisted (unlike `syncQueue.ts`'s own
 * state), since "syncing" only ever means "a network call is in flight
 * in this running process this instant", never something that should
 * survive an app restart. Lets the UI show a genuine fourth status
 * ("Syncing") distinct from "queued, waiting for the next retry"
 * ("Saved offline") without syncQueue.ts's own persisted item shape
 * needing an in-flight field it would have to remember to always reset.
 */
type Listener = () => void;

const inFlight = new Set<string>();
const listeners = new Set<Listener>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function isSyncing(id: string): boolean {
  return inFlight.has(id);
}

export function markSyncing(id: string): void {
  inFlight.add(id);
  notify();
}

export function markSyncSettled(id: string): void {
  inFlight.delete(id);
  notify();
}

export function subscribeSyncActivity(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
