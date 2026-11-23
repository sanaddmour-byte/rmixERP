import * as React from "react";
import { useListBranches } from "@rmixerp/contract";
import { useCurrentUser } from "./useCurrentUser";

const STORAGE_KEY = "rmixerp-active-branch";

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStored(id: string) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // private browsing / storage disabled — the choice just won't persist
  }
}

/**
 * The plant (branch) the signed-in user is currently working in, visible
 * everywhere in the shell after sign-in rather than only on Dispatch's own
 * selector. Most roles are assigned a fixed `branchId` on their user
 * record — for them this is a read-only label, since there's no real
 * choice to offer. A user with no fixed branch (HQ/admin roles that see
 * every plant) gets a switchable dropdown, persisted across reloads.
 */
export function useActiveBranch() {
  const { data: currentUser } = useCurrentUser();
  const user = currentUser?.status === 200 ? currentUser.data : undefined;
  const branches = useListBranches({ page: 1, pageSize: 100 });
  const branchOptions =
    branches.data?.status === 200 && typeof branches.data.data !== "string" ? branches.data.data.items : [];

  const fixedBranchId = user?.branchId ?? null;
  const [selected, setSelected] = React.useState<string | null>(readStored);

  const activeBranchId = fixedBranchId ?? selected ?? branchOptions[0]?.id ?? null;
  const activeBranch = branchOptions.find((b) => b.id === activeBranchId) ?? null;
  const canSwitch = fixedBranchId === null && branchOptions.length > 1;

  function setActiveBranchId(id: string) {
    setSelected(id);
    writeStored(id);
  }

  return { activeBranchId, activeBranch, branchOptions, canSwitch, setActiveBranchId };
}
