import type { NextFunction, Request, Response } from "express";
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { idempotencyKey, withTenant } from "@rmixerp/db";
import { db } from "../db";

/**
 * CLAUDE.md Hard Rule: "All POST endpoints that create documents accept
 * an `Idempotency-Key` header and dedupe on it." Introduced in Phase 6
 * (which needs it for exactly-once invoice generation) and applied to
 * this phase's new document-creating routes; retrofitting it onto every
 * Phase 1-5 POST route is tracked as follow-up work in `docs/PLAN.md`,
 * not silently skipped.
 *
 * Behavior when the header is present:
 * - Unseen key: claims it (an INSERT racing any concurrent duplicate),
 *   runs the handler, then persists its response against the key.
 * - Seen key, same request: replays the original response without
 *   re-running the handler.
 * - Seen key, different request body/route: 422 — reusing a key for a
 *   different request is a client error, not a legitimate retry.
 * - Seen key, still in flight (lost the claim race, no response yet):
 *   409 — the original request is still being processed.
 *
 * No header: passes through untouched: this guard is opt-in per request,
 * not a mandatory client behavior.
 */
export function idempotent() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const key = req.header("Idempotency-Key");
    if (!key) {
      next();
      return;
    }
    const companyId = req.auth!.companyId;
    const route = `${req.method} ${req.route?.path ?? req.path}`;
    const requestHash = createHash("sha256")
      .update(`${req.method} ${req.originalUrl}\n${JSON.stringify(req.body ?? {})}`)
      .digest("hex");

    const claim = await withTenant(db, companyId, async (tx) => {
      const [inserted] = await tx
        .insert(idempotencyKey)
        .values({ companyId, key, route, requestHash })
        .onConflictDoNothing()
        .returning();
      if (inserted) return { kind: "claimed" as const, row: inserted };

      const [existing] = await tx
        .select()
        .from(idempotencyKey)
        .where(and(eq(idempotencyKey.companyId, companyId), eq(idempotencyKey.key, key)));
      if (!existing) throw new Error("idempotency key lookup returned no row after a losing insert race");
      return { kind: "existing" as const, row: existing };
    });

    if (claim.kind === "existing") {
      if (claim.row.requestHash !== requestHash) {
        res.status(422).json({
          error: { message: "Idempotency-Key was already used for a different request", code: "idempotency_key_conflict" },
        });
        return;
      }
      if (claim.row.responseStatus === null) {
        res.status(409).json({
          error: { message: "A request with this Idempotency-Key is already in progress", code: "idempotency_key_in_progress" },
        });
        return;
      }
      res.status(claim.row.responseStatus).json(claim.row.responseBody);
      return;
    }

    // Persist the response before it goes out, not fire-and-forget after —
    // a detached write racing process/test teardown could leave the row
    // stuck with responseStatus null forever (permanently "in progress"
    // for that key).
    const rowId = claim.row.id;
    const originalJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      const statusCode = res.statusCode;
      withTenant(db, companyId, (tx) =>
        tx.update(idempotencyKey).set({ responseStatus: statusCode, responseBody: body }).where(eq(idempotencyKey.id, rowId)),
      )
        .catch((err: unknown) => {
          req.log?.error({ err }, "failed to persist idempotency response");
        })
        .finally(() => originalJson(body));
      return res;
    }) as Response["json"];
    next();
  };
}
