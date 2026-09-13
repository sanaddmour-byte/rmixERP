import { describe, expect, it } from "vitest";
import { evaluateDocumentExpiry } from "../src/documentExpiry";

const ASOF = new Date("2026-06-01T00:00:00.000Z");

describe("evaluateDocumentExpiry", () => {
  it("is not blocked when every tracked document is well within its valid window", () => {
    const result = evaluateDocumentExpiry({
      asOf: ASOF,
      warningDays: 30,
      truck: { registrationExpiresAt: new Date("2027-01-01"), insuranceExpiresAt: new Date("2027-01-01"), inspectionExpiresAt: new Date("2027-01-01") },
      driver: { licenseExpiresAt: new Date("2027-01-01") },
    });
    expect(result.blocked).toBe(false);
    expect(result.expiredDocuments).toHaveLength(0);
    expect(result.warningDocuments).toHaveLength(0);
  });

  it("blocks and reports an already-expired truck registration", () => {
    const result = evaluateDocumentExpiry({
      asOf: ASOF,
      warningDays: 30,
      truck: { registrationExpiresAt: new Date("2026-05-01"), insuranceExpiresAt: null, inspectionExpiresAt: null },
      driver: null,
    });
    expect(result.blocked).toBe(true);
    expect(result.expiredDocuments).toEqual(["truck.registration"]);
    expect(result.warningDocuments).toHaveLength(0);
  });

  it("blocks on an already-expired driver license", () => {
    const result = evaluateDocumentExpiry({
      asOf: ASOF,
      warningDays: 30,
      truck: null,
      driver: { licenseExpiresAt: new Date("2026-01-01") },
    });
    expect(result.blocked).toBe(true);
    expect(result.expiredDocuments).toEqual(["driver.license"]);
  });

  it("surfaces a document expiring within the warning window as a warning, not a block", () => {
    const result = evaluateDocumentExpiry({
      asOf: ASOF,
      warningDays: 30,
      truck: { registrationExpiresAt: null, insuranceExpiresAt: new Date("2026-06-15"), inspectionExpiresAt: null },
      driver: null,
    });
    expect(result.blocked).toBe(false);
    expect(result.expiredDocuments).toHaveLength(0);
    expect(result.warningDocuments).toEqual(["truck.insurance"]);
  });

  it("does not warn on a document just past the warning window", () => {
    const result = evaluateDocumentExpiry({
      asOf: ASOF,
      warningDays: 30,
      truck: { registrationExpiresAt: null, insuranceExpiresAt: new Date("2026-07-15"), inspectionExpiresAt: null },
      driver: null,
    });
    expect(result.blocked).toBe(false);
    expect(result.warningDocuments).toHaveLength(0);
  });

  it("treats an untracked (null) expiry date as fine, not blocking", () => {
    const result = evaluateDocumentExpiry({
      asOf: ASOF,
      warningDays: 30,
      truck: { registrationExpiresAt: null, insuranceExpiresAt: null, inspectionExpiresAt: null },
      driver: { licenseExpiresAt: null },
    });
    expect(result.blocked).toBe(false);
    expect(result.expiredDocuments).toHaveLength(0);
    expect(result.warningDocuments).toHaveLength(0);
  });

  it("collects multiple expired documents across both truck and driver", () => {
    const result = evaluateDocumentExpiry({
      asOf: ASOF,
      warningDays: 30,
      truck: { registrationExpiresAt: new Date("2026-01-01"), insuranceExpiresAt: new Date("2026-01-01"), inspectionExpiresAt: null },
      driver: { licenseExpiresAt: new Date("2026-01-01") },
    });
    expect(result.blocked).toBe(true);
    expect(result.expiredDocuments.sort()).toEqual(["driver.license", "truck.insurance", "truck.registration"].sort());
  });
});
