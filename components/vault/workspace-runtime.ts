import type { VaultFolder, VaultPort, VaultSnapshot } from "@/components/vault/vault-client";
import {
  paneForPath,
  paneSlots,
  sanitiseStoredWorkspace,
  type WorkspaceState,
  type WorkspaceTab,
} from "@/components/vault/workspace-model";
import type { WorkspaceStorage } from "@/components/vault/workspace-storage";
import type { VaultItem } from "@/components/vault/vault-types";

export type WorkspaceRestoreFailure = {
  dedupeKey: string;
  message: string;
  path: string;
};

export type RestoredWorkspace = {
  failures: WorkspaceRestoreFailure[];
  folders: VaultFolder[];
  items: VaultItem[];
  snapshot: VaultSnapshot;
  tabs: WorkspaceTab<VaultItem>[];
  workspace: WorkspaceState;
};

/** Restores the persisted document workspace after the Vault snapshot is available. */
export function restoreWorkspace(vault: VaultPort, storage: WorkspaceStorage): Promise<RestoredWorkspace>;
export function restoreWorkspace(
  vault: VaultPort,
  storage: WorkspaceStorage,
  signal: AbortSignal,
): Promise<RestoredWorkspace | null>;
export async function restoreWorkspace(
  vault: VaultPort,
  storage: WorkspaceStorage,
  signal?: AbortSignal,
): Promise<RestoredWorkspace | null> {
  const snapshot = await vault.listSnapshot();
  if (signal?.aborted) return null;
  const restored = sanitiseStoredWorkspace(storage.readWorkspace(), snapshot.items);
  const itemsByPath = new Map(snapshot.items.map((item) => [item.path, item]));
  const tabsToRestore: WorkspaceTab<VaultItem>[] = restored.openPaths.flatMap((path) => {
    const item = itemsByPath.get(path);
    return item ? [{
      content: "",
      editorMode: "edit" as const,
      isLoading: item.kind === "note",
      item,
      savedContent: "",
    }] : [];
  });
  const failures: WorkspaceRestoreFailure[] = [];

  const tabs = (await Promise.all(tabsToRestore.map(async (tab) => {
    if (tab.item.kind !== "note") return { ...tab, isLoading: false };
    try {
      const content = await vault.readNote(tab.item.path);
      return { ...tab, content, isLoading: false, savedContent: content };
    } catch (error) {
      failures.push({
        dedupeKey: `restore-note:${tab.item.path}`,
        message: error instanceof Error ? error.message : "Не удалось открыть заметку",
        path: tab.item.path,
      });
      return null;
    }
  }))).filter((tab): tab is WorkspaceTab<VaultItem> => tab !== null);

  const restoredPaths = new Set(tabs.map((tab) => tab.item.path));
  const activePath = restored.activePath && restoredPaths.has(restored.activePath)
    ? restored.activePath
    : tabs[0]?.item.path ?? null;
  const panes = { ...restored.panes };

  for (const slot of paneSlots) {
    if (panes[slot] && !restoredPaths.has(panes[slot])) panes[slot] = null;
  }

  if (!paneForPath(panes, activePath ?? "") && activePath) {
    const previousPane = paneForPath(panes, activePath);
    if (previousPane) panes[previousPane] = null;
    panes.topLeft = activePath;
  }

  return {
    failures,
    folders: snapshot.folders,
    items: snapshot.items,
    snapshot,
    tabs,
    workspace: {
      activePath,
      focusedPane: panes[restored.focusedPane]
        ? restored.focusedPane
        : paneForPath(panes, activePath ?? "") ?? "topLeft",
      openPaths: tabs.map((tab) => tab.item.path),
      panes,
      splitRatio: restored.splitRatio,
    },
  };
}
