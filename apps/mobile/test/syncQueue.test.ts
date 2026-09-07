import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve();
    }),
  },
}));

const deliverDeliveryOrder = vi.fn();
vi.mock("@rmixerp/contract", () => ({ deliverDeliveryOrder }));

const { discardItem, enqueueProofOfDelivery, listQueue, retryAllPending, retryItem } = await import("../src/lib/syncQueue.js");

const REQUEST = { receivedQuantityM3: "5.0", signedByName: "Test Driver", signatureData: "data:image/svg+xml,<svg/>" };

describe("mobile offline sync queue (AsyncStorage-backed)", () => {
  beforeEach(() => {
    store.clear();
    deliverDeliveryOrder.mockReset();
  });

  it("enqueues a proof-of-delivery submission and lists it back as pending", async () => {
    const item = await enqueueProofOfDelivery({ deliveryOrderId: "do-1", request: REQUEST });
    expect(item.status).toBe("pending");

    const items = await listQueue();
    expect(items).toHaveLength(1);
    expect(items[0]?.payload.deliveryOrderId).toBe("do-1");
  });

  it("removes the item on a successful retry", async () => {
    await enqueueProofOfDelivery({ deliveryOrderId: "do-2", request: REQUEST });
    deliverDeliveryOrder.mockResolvedValue({ status: 200, data: { id: "do-2" } });

    const [item] = await listQueue();
    const outcome = await retryItem(item!.id);

    expect(outcome).toBe("synced");
    expect(await listQueue()).toHaveLength(0);
  });

  it("keeps a transport-error item queued as failed, incrementing attempts", async () => {
    await enqueueProofOfDelivery({ deliveryOrderId: "do-3", request: REQUEST });
    deliverDeliveryOrder.mockRejectedValue(new TypeError("Network request failed"));

    const [item] = await listQueue();
    const outcome = await retryItem(item!.id);

    expect(outcome).toBe("network_error");
    const [updated] = await listQueue();
    expect(updated?.status).toBe("failed");
    expect(updated?.attempts).toBe(1);
    expect(updated?.lastError).toContain("Network request failed");
  });

  it("marks a non-200 server response as a conflict rather than retrying it silently", async () => {
    await enqueueProofOfDelivery({ deliveryOrderId: "do-4", request: REQUEST });
    deliverDeliveryOrder.mockResolvedValue({ status: 400, data: { error: { message: "Delivery order is not dispatched", code: "invalid_status" } } });

    const [item] = await listQueue();
    await retryItem(item!.id);

    const [updated] = await listQueue();
    expect(updated?.status).toBe("conflict");
    expect(updated?.lastError).toBe("Delivery order is not dispatched");
  });

  it("discards a conflict item permanently", async () => {
    await enqueueProofOfDelivery({ deliveryOrderId: "do-5", request: REQUEST });
    deliverDeliveryOrder.mockResolvedValue({ status: 404, data: { error: { message: "not found", code: "not_found" } } });
    const [item] = await listQueue();
    await retryItem(item!.id);

    await discardItem(item!.id);
    expect(await listQueue()).toHaveLength(0);
  });

  it("retryAllPending skips conflict items but retries pending/failed ones", async () => {
    await enqueueProofOfDelivery({ deliveryOrderId: "conflict-me", request: REQUEST });
    deliverDeliveryOrder.mockResolvedValueOnce({ status: 400, data: { error: { message: "bad state", code: "invalid_status" } } });
    const [conflictItem] = await listQueue();
    await retryItem(conflictItem!.id); // now status: "conflict"

    await enqueueProofOfDelivery({ deliveryOrderId: "should-sync", request: REQUEST });
    deliverDeliveryOrder.mockResolvedValue({ status: 200, data: { id: "should-sync" } });

    await retryAllPending();

    const remaining = await listQueue();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.status).toBe("conflict");
    expect(remaining[0]?.payload.deliveryOrderId).toBe("conflict-me");
  });
});
