import * as React from "react";
import { NAV_GROUPS, type NavGroup } from "./navConfig";
import { useCurrentUser } from "./useCurrentUser";

function hasView(permissions: string[], module: string): boolean {
  return permissions.includes(`${module}:view`);
}

/** NAV_GROUPS filtered to what the signed-in user can view, empty groups dropped. Shared by Sidebar and HomePage. */
export function useVisibleNavGroups(): NavGroup[] {
  const { data: currentUser } = useCurrentUser();

  return React.useMemo(() => {
    const permissions = currentUser?.status === 200 ? currentUser.data.permissions : [];
    return NAV_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter((item) => hasView(permissions, item.module)),
    })).filter((group) => group.items.length > 0);
  }, [currentUser]);
}
