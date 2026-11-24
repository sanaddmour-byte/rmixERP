import http from "node:http";
import { describe, expect, it, afterAll } from "vitest";
import { JoFotaraProvider } from "../src/clearance/jofotara/provider";

/** A server that accepts the connection but never responds — exercises the provider's own request timeout rather than a real network failure. */
function startHangingServer(): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = http.createServer(() => {
      // Never calls res.end() — the request just hangs until the client gives up.
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise<void>((res) => server.close(() => res())),
      });
    });
  });
}

describe("JoFotaraProvider bounded timeout", () => {
  let close: (() => Promise<void>) | undefined;

  afterAll(async () => {
    await close?.();
  });

  it("resolves to a transport_error instead of hanging indefinitely when the provider never responds", async () => {
    const server = await startHangingServer();
    close = server.close;

    const provider = new JoFotaraProvider({ baseUrl: server.url, clientId: "test-client", clientSecret: "test-secret", timeoutMs: 200 });

    const started = Date.now();
    const outcome = await provider.submit({ documentId: "00000000-0000-4000-8000-000000000001", documentType: "invoice", icv: 1, ublXml: "<Invoice/>" });
    const elapsedMs = Date.now() - started;

    expect(outcome.kind).toBe("transport_error");
    // Bounded by the configured timeout, not left to the platform's own (much longer, or absent) default.
    expect(elapsedMs).toBeLessThan(5_000);
  }, 10_000);
});
