interface Refetchable {
  refetch: () => unknown;
}

/**
 * The generated mutation hooks don't know which list query to invalidate,
 * so every create/update/void call needs this to make its own list
 * re-fetch on success — otherwise the UI silently shows stale data after
 * a successful mutation.
 */
export function refetchOnSuccess(query: Refetchable) {
  return { mutation: { onSuccess: () => query.refetch() } };
}
