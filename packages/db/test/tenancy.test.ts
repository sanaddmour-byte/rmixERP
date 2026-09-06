import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "../src/client";
import { withTenant } from "../src/tenancy";
import { branch, company } from "../src/schema/index";

/**
 * Proves the ONE tenancy guard (CLAUDE.md Hard Rules) actually works: a
 * route cannot leak or write cross-company rows, regardless of what WHERE
 * clause it does or doesn't write, because Postgres row-level security —
 * not application code — is what decides which rows exist for a query.
 *
 * Runs against a real Postgres (TEST_DATABASE_URL / TEST_OWNER_DATABASE_URL),
 * per CLAUDE.md's rule that business-rule tests hit a real database, not a
 * mocked repository.
 */

const ownerUrl =
  process.env.TEST_OWNER_DATABASE_URL ??
  "postgres://postgres:postgres_dev_password@localhost:5432/rmixerp_test";
const appUrl =
  process.env.TEST_DATABASE_URL ??
  "postgres://rmixerp_app:rmixerp_app_dev_password@localhost:5432/rmixerp_test";

let ownerDb: Db;
let appDb: Db;
let companyA: { id: string };
let companyB: { id: string };

beforeAll(async () => {
  ownerDb = createDb(ownerUrl);
  appDb = createDb(appUrl);

  const [insertedA] = await ownerDb
    .insert(company)
    .values({ name: `Tenancy Test Co A ${crypto.randomUUID()}` })
    .returning({ id: company.id });
  const [insertedB] = await ownerDb
    .insert(company)
    .values({ name: `Tenancy Test Co B ${crypto.randomUUID()}` })
    .returning({ id: company.id });
  if (!insertedA || !insertedB) throw new Error("failed to insert fixture companies");
  companyA = insertedA;
  companyB = insertedB;

  await ownerDb.insert(branch).values([
    { companyId: companyA.id, name: "A Plant 1", code: "TA1" },
    { companyId: companyA.id, name: "A Plant 2", code: "TA2" },
    { companyId: companyB.id, name: "B Plant 1", code: "TB1" },
  ]);
});

afterAll(async () => {
  await ownerDb.delete(branch).where(eq(branch.companyId, companyA.id));
  await ownerDb.delete(branch).where(eq(branch.companyId, companyB.id));
  await ownerDb.delete(company).where(eq(company.id, companyA.id));
  await ownerDb.delete(company).where(eq(company.id, companyB.id));
});

describe("tenancy guard (Postgres RLS via withTenant)", () => {
  it("returns zero rows for a query that never establishes a tenant context", async () => {
    // Simulates a route that "forgot" to call withTenant: a plain query
    // over the app-role connection, no company context set at all.
    const rows = await appDb.select().from(branch);
    const leaked = rows.filter((r) => r.companyId === companyA.id || r.companyId === companyB.id);
    expect(leaked).toEqual([]);
  });

  it("scopes an unfiltered SELECT to the tenant in context, even with no WHERE clause", async () => {
    const rows = await withTenant(appDb, companyA.id, (tx) => tx.select().from(branch));
    const codes = rows.map((r) => r.code).sort();
    expect(codes).toEqual(["TA1", "TA2"]);
  });

  it("a different tenant context sees only its own rows", async () => {
    const rows = await withTenant(appDb, companyB.id, (tx) => tx.select().from(branch));
    expect(rows.map((r) => r.code)).toEqual(["TB1"]);
  });

  it("a query for another company's row by exact id still returns nothing", async () => {
    const [target] = await ownerDb
      .select()
      .from(branch)
      .where(eq(branch.companyId, companyB.id));
    if (!target) throw new Error("fixture missing");

    const rows = await withTenant(appDb, companyA.id, (tx) =>
      tx.select().from(branch).where(eq(branch.id, target.id)),
    );
    expect(rows).toEqual([]);
  });

  it("rejects an INSERT that tries to write a different company's id than the active tenant", async () => {
    await expect(
      withTenant(appDb, companyA.id, (tx) =>
        tx.insert(branch).values({ companyId: companyB.id, name: "Sneaky", code: "SNK" }),
      ),
    ).rejects.toThrow();
  });

  it("rejects a bare companyId string that is not a valid UUID", async () => {
    await expect(withTenant(appDb, "'; DROP TABLE branch; --", async () => undefined)).rejects.toThrow(
      /not a valid UUID/,
    );
  });
});
