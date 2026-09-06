import { and, eq, inArray, isNull } from "drizzle-orm";
import { priceList, priceListLine, type Tx } from "@rmixerp/db";
import { fils, resolvePrice, type ResolvedPrice } from "@rmixerp/core";

export interface PriceResolutionContext {
  branchId: string;
  customerId: string;
  projectId: string | null;
}

/**
 * Gathers every price-list line that could apply to this product for this
 * quotation/sales-order's customer/project/branch, then hands them to
 * packages/core's `resolvePrice` to pick the highest-precedence active one.
 * Returns null when no price is configured anywhere in the tier chain.
 */
export async function resolveLinePrice(
  tx: Tx,
  ctx: PriceResolutionContext,
  productId: string,
  asOf: Date = new Date(),
): Promise<ResolvedPrice | null> {
  const lists = await tx
    .select()
    .from(priceList)
    .where(and(isNull(priceList.voidedAt), eq(priceList.isActive, true)));

  const relevantLists = lists.filter((list) => {
    if (list.tier === "company") return true;
    if (list.tier === "branch") return list.branchId === ctx.branchId;
    if (list.tier === "customer") return list.customerId === ctx.customerId;
    if (list.tier === "project") return ctx.projectId !== null && list.projectId === ctx.projectId;
    return false;
  });
  if (relevantLists.length === 0) return null;

  const tierByListId = new Map(relevantLists.map((list) => [list.id, list.tier]));
  const lines = await tx
    .select()
    .from(priceListLine)
    .where(
      and(
        eq(priceListLine.productId, productId),
        isNull(priceListLine.voidedAt),
        inArray(
          priceListLine.priceListId,
          relevantLists.map((list) => list.id),
        ),
      ),
    );

  const candidates = lines.map((line) => {
    const tier = tierByListId.get(line.priceListId);
    if (!tier) throw new Error("price list line referenced a price list outside the resolved candidate set");
    return {
      tier,
      priceListId: line.priceListId,
      priceListLineId: line.id,
      concreteUnitPriceFils: fils(line.concreteUnitPriceFils),
      deliveryUnitPriceFils: fils(line.deliveryUnitPriceFils),
      taxRateBasisPoints: line.taxRateBasisPoints,
      effectiveFrom: line.effectiveFrom,
      effectiveTo: line.effectiveTo,
    };
  });

  return resolvePrice(candidates, asOf);
}
