import { Link } from "wouter";
import { useListNotifications, useMarkNotificationRead, type Notification } from "@rmixerp/contract";
import { resolveNotificationRoute, NOTIFICATION_TYPES, type NotificationType } from "@rmixerp/core";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@rmixerp/ui";
import { refetchOnSuccess } from "../lib/refetchOnSuccess";

function isNotificationType(value: string): value is NotificationType {
  return (NOTIFICATION_TYPES as readonly string[]).includes(value);
}

/** Where a notification links to -- falls back to no link for a type the resolver doesn't (yet) know. */
function hrefFor(n: Notification): string | undefined {
  return isNotificationType(n.type) ? resolveNotificationRoute("web", n.type, n.entityId) : undefined;
}

/**
 * Cross-module notification inbox (PLAN.md Phase 10c): every notification
 * type the signed-in user's permissions cover, in one list, each linking
 * to its source document via `resolveNotificationRoute`. The server already
 * scopes `GET /notifications` to types this user can act on (and to
 * anything individually addressed to them) -- this component just renders
 * what comes back.
 */
export function NotificationsPanel({ title = "Notifications" }: { title?: string }) {
  const notifications = useListNotifications({ page: 1, pageSize: 20, unreadOnly: true });
  const markRead = useMarkNotificationRead(refetchOnSuccess(notifications));
  const body = notifications.data?.status === 200 ? notifications.data.data : undefined;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {title} {body && body.total > 0 && `(${body.total} unread)`}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {(body?.items.length ?? 0) === 0 && <p className="text-sm text-navy-400">No unread notifications.</p>}
        {body?.items.map((n) => {
          const href = hrefFor(n);
          return (
            <div key={n.id} className="flex items-center justify-between gap-4 rounded-md border border-orange-200 bg-orange-50 p-2 text-sm dark:border-orange-900 dark:bg-orange-950">
              <div>
                {href ? (
                  <Link href={href} className="text-orange-900 hover:underline dark:text-orange-200">
                    {n.message}
                  </Link>
                ) : (
                  <p className="text-orange-900 dark:text-orange-200">{n.message}</p>
                )}
                <p className="text-xs text-orange-600 dark:text-orange-400">{new Date(n.createdAt).toLocaleString()}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => markRead.mutate({ id: n.id })} disabled={markRead.isPending}>
                Mark read
              </Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
