/**
 * Every notification type this app produces, and the one shared mapping
 * from a notification to the screen it's about (PLAN.md Phase 10: "push
 * notifications with typed deep links resolving in both web and mobile
 * via one shared resolver"). Framework-free by design, like every other
 * `packages/core` module — web (wouter) and mobile (expo-router) each
 * feed the returned path straight into their own router, but the mapping
 * of *which* screen a given notification type points at lives here once.
 *
 * Web and mobile don't share a routing convention (web seeds an existing
 * list+detail-panel page via `?id=`, mobile navigates a dedicated
 * `/xxx/:id` screen), so the resolver takes the platform explicitly
 * rather than guessing one shape fits both.
 */
export const NOTIFICATION_TYPES = ["qc_cube_test_failed", "purchase_request_submitted", "purchase_order_submitted"] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type NotificationPlatform = "web" | "mobile";

interface RouteBuilder {
  web: (entityId: string) => string;
  mobile: (entityId: string) => string;
}

const ROUTES: Record<NotificationType, RouteBuilder> = {
  qc_cube_test_failed: { web: (id) => `/production-orders?id=${id}`, mobile: (id) => `/production-orders/${id}` },
  purchase_request_submitted: { web: (id) => `/purchase-requests?id=${id}`, mobile: (id) => `/purchase-requests/${id}` },
  purchase_order_submitted: { web: (id) => `/purchase-orders?id=${id}`, mobile: (id) => `/purchase-orders/${id}` },
};

/**
 * `entityId` is the notification's own `entityId` column — for
 * `qc_cube_test_failed` that's the *production order* id (not the batch
 * it flagged), since batches have no standalone screen and only ever
 * appear embedded in their production order's detail page.
 */
export function resolveNotificationRoute(platform: NotificationPlatform, type: NotificationType, entityId: string): string {
  return ROUTES[type][platform](entityId);
}

/**
 * The permission a viewer needs to see a notification of this type, since
 * these are role-based alerts (anyone who can act on the thing), not
 * individually assigned — mirrors the same modules the approvals inbox
 * (`GET /approvals`) already filters by. A type with no entry here is
 * visible to anyone in the company (matches `qc_cube_test_failed`'s
 * existing broadcast behavior — any QC-permitted viewer, not one person).
 */
export const NOTIFICATION_TYPE_REQUIRED_PERMISSION: Partial<Record<NotificationType, string>> = {
  qc_cube_test_failed: "qc:view",
  purchase_request_submitted: "purchaseRequests:approve",
  purchase_order_submitted: "purchaseOrders:approve",
};
