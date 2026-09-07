import * as React from "react";
import { useRouter } from "expo-router";
import { useCurrentUser } from "./useCurrentUser";
import { getAccessToken } from "./session";

/** Redirects to /login if there's no valid session; screens should render nothing until `ready`. */
export function useRequireAuth() {
  const router = useRouter();
  const currentUser = useCurrentUser();
  const hasToken = Boolean(getAccessToken());

  React.useEffect(() => {
    if (!hasToken || (!currentUser.isLoading && currentUser.data?.status !== 200)) {
      router.replace("/login");
    }
  }, [hasToken, currentUser.isLoading, currentUser.data, router]);

  return { ready: hasToken && currentUser.data?.status === 200 };
}
