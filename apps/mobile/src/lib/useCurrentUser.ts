import { useGetCurrentUser } from "@rmixerp/contract";
import { getAccessToken } from "./session";

/** The signed-in user, or `null` data when there's no token / the token is invalid. */
export function useCurrentUser() {
  return useGetCurrentUser({
    query: {
      enabled: Boolean(getAccessToken()),
      retry: false,
      staleTime: 60_000,
    },
  });
}
