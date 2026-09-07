import { NotificationsPanel } from "../components/NotificationsPanel";

/** Standalone entry point for the cross-module notification inbox (PLAN.md Phase 10c) -- the same panel embedded on QCPage, for users whose notifications aren't QC-related (e.g. a purchasing approver with no reason to visit the QC page). */
export function NotificationsPage() {
  return <NotificationsPanel />;
}
