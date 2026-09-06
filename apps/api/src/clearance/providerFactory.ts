import { MockClearanceProvider, type ClearanceProvider } from "@rmixerp/core";
import { JoFotaraProvider } from "./jofotara/provider";

/**
 * Defaults to `MockClearanceProvider` (CLAUDE.md/PLAN.md: "MockClearanceProvider
 * (default)"). Only switches to the real, unverified `JoFotaraProvider`
 * shell when explicitly configured — this keeps every environment
 * functional (dev, CI, this repo's own tests) without a real JoFotara
 * account, and makes going live with real clearance an explicit config
 * change, not an accidental one.
 */
export function createClearanceProvider(): ClearanceProvider {
  if (process.env.CLEARANCE_PROVIDER === "jofotara") {
    const baseUrl = process.env.JOFOTARA_BASE_URL;
    const clientId = process.env.JOFOTARA_CLIENT_ID;
    const clientSecret = process.env.JOFOTARA_CLIENT_SECRET;
    if (!baseUrl || !clientId || !clientSecret) {
      throw new Error(
        "CLEARANCE_PROVIDER=jofotara requires JOFOTARA_BASE_URL, JOFOTARA_CLIENT_ID, and JOFOTARA_CLIENT_SECRET",
      );
    }
    return new JoFotaraProvider({ baseUrl, clientId, clientSecret });
  }
  return new MockClearanceProvider();
}
