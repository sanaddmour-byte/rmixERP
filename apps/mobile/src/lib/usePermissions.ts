import { useCurrentUser } from "./useCurrentUser";

/** `{ view, create, edit, approve, void }` booleans for one module, from the signed-in user's cached permissions. */
export function useModulePermissions(module: string) {
  const { data } = useCurrentUser();
  const permissions = data?.status === 200 ? data.data.permissions : [];
  const has = (action: string) => permissions.includes(`${module}:${action}`);
  return { view: has("view"), create: has("create"), edit: has("edit"), approve: has("approve"), void: has("void") };
}
