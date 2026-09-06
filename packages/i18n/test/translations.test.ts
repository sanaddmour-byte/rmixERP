import { describe, expect, it } from "vitest";
import { translations } from "../src/translations";

function leafKeys(obj: unknown, prefix = ""): string[] {
  if (typeof obj !== "object" || obj === null) return [prefix];
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "function") return [path];
    return leafKeys(value, path);
  });
}

describe("translations", () => {
  it("has the exact same key shape in every locale (catches a missing translation)", () => {
    const [en, ...rest] = Object.values(translations);
    const enKeys = leafKeys(en).sort();
    for (const locale of rest) {
      expect(leafKeys(locale).sort()).toEqual(enKeys);
    }
  });

  it("has non-empty Arabic strings for every English string", () => {
    for (const key of leafKeys(translations.en)) {
      const arValue = key.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], translations.ar);
      if (typeof arValue === "string") {
        expect(arValue.length).toBeGreaterThan(0);
      }
    }
  });
});
