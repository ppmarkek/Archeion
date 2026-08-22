import { expect, test } from "vitest";

import type { VaultPort } from "@/components/vault/vault-client";
import { restoreWorkspace } from "@/components/vault/workspace-runtime";
import type { WorkspaceStorage } from "@/components/vault/workspace-storage";

const plan = {
  kind: "note" as const,
  mimeType: "text/markdown",
  name: "Plan.md",
  path: "Notes/Plan.md",
  size: 10,
  updatedAt: "2026-08-21T00:00:00.000Z",
};

const reference = {
  kind: "attachment" as const,
  mimeType: "application/pdf",
  name: "Reference.pdf",
  path: "Sources/Reference.pdf",
  size: 20,
  updatedAt: "2026-08-21T00:00:00.000Z",
};

function createVault(readNote: VaultPort["readNote"]): VaultPort {
  return {
    listSnapshot: async () => ({
      folders: [{ kind: "folder", name: "Notes", path: "Notes", updatedAt: "2026-08-21T00:00:00.000Z" }],
      items: [plan, reference],
    }),
    readNote,
    saveNote: async () => plan,
    createNote: async () => plan,
    createFolder: async () => ({ kind: "folder", name: "Notes", path: "Notes", updatedAt: "2026-08-21T00:00:00.000Z" }),
    upload: async () => reference,
    rename: async () => ({ newPath: plan.path, oldPath: plan.path, pathChanges: [] }),
    move: async () => ({ newPath: plan.path, oldPath: plan.path, pathChanges: [] }),
    delete: async () => ({ deletedPath: plan.path, kind: "note" }),
    search: async () => [],
  };
}

function createStorage(workspace: ReturnType<WorkspaceStorage["readWorkspace"]>): WorkspaceStorage {
  return {
    readWorkspace: () => workspace,
    writeWorkspace: () => undefined,
    readPanelPreferences: () => ({ compact: null, position: null, presentation: null, size: {} }),
    writePanelPreferences: () => undefined,
    readLibraryPreferences: () => ({}),
    writeLibraryPreferences: () => undefined,
  };
}

test("restores persisted tabs in order with note content and an intact workspace", async () => {
  const readPaths: string[] = [];
  const restored = await restoreWorkspace(createVault(async (path) => {
    readPaths.push(path);
    return "# Plan";
  }), createStorage({
    activePath: plan.path,
    focusedPane: "topRight",
    openPaths: [reference.path, plan.path],
    panes: { topLeft: reference.path, topRight: plan.path },
    splitRatio: 0.64,
  }));

  expect(readPaths).toEqual([plan.path]);
  expect(restored.snapshot).toEqual({
    folders: [{ kind: "folder", name: "Notes", path: "Notes", updatedAt: "2026-08-21T00:00:00.000Z" }],
    items: [plan, reference],
  });
  expect(restored).toMatchObject({
    failures: [],
    folders: [{ name: "Notes", path: "Notes" }],
    items: [plan, reference],
    tabs: [
      { content: "", isLoading: false, item: reference, savedContent: "" },
      { content: "# Plan", isLoading: false, item: plan, savedContent: "# Plan" },
    ],
    workspace: {
      activePath: plan.path,
      focusedPane: "topRight",
      openPaths: [reference.path, plan.path],
      panes: { bottomLeft: null, bottomRight: null, topLeft: reference.path, topRight: plan.path },
      splitRatio: 0.64,
    },
  });
});

test("drops an unreadable Note and its pane reference while retaining the remaining workspace", async () => {
  const restored = await restoreWorkspace(createVault(async () => {
    throw new Error("Нет доступа к заметке");
  }), createStorage({
    activePath: plan.path,
    focusedPane: "topLeft",
    openPaths: [plan.path, reference.path],
    panes: { topLeft: plan.path, topRight: reference.path },
    splitRatio: 0.37,
  }));

  expect(restored.failures).toEqual([{
    dedupeKey: `restore-note:${plan.path}`,
    message: "Нет доступа к заметке",
    path: plan.path,
  }]);
  expect(restored.tabs).toEqual([
    expect.objectContaining({ item: reference, isLoading: false }),
  ]);
  expect(restored.workspace).toEqual({
    activePath: reference.path,
    focusedPane: "topRight",
    openPaths: [reference.path],
    panes: { bottomLeft: null, bottomRight: null, topLeft: null, topRight: reference.path },
    splitRatio: 0.37,
  });
});

test.each([
  ["missing", {}],
  ["malformed", {
    activePath: 42,
    focusedPane: "elsewhere",
    openPaths: "Notes/Plan.md",
    panes: null,
    splitRatio: Number.NaN,
  }],
])("uses a safe default workspace when storage is %s", async (_kind, persistedWorkspace) => {
  const restored = await restoreWorkspace(createVault(async () => "# Plan"), createStorage(persistedWorkspace));

  expect(restored.workspace).toEqual({
    activePath: plan.path,
    focusedPane: "topLeft",
    openPaths: [plan.path],
    panes: { bottomLeft: null, bottomRight: null, topLeft: plan.path, topRight: null },
    splitRatio: 0.5,
  });
  expect(restored.tabs).toEqual([
    expect.objectContaining({ content: "# Plan", item: plan, isLoading: false, savedContent: "# Plan" }),
  ]);
});

test("cancels after the Vault snapshot without reading persisted state or Notes", async () => {
  const controller = new AbortController();
  let workspaceReads = 0;
  let noteReads = 0;
  const baseVault = createVault(async () => {
    noteReads += 1;
    return "# Plan";
  });
  const vault: VaultPort = {
    ...baseVault,
    listSnapshot: async () => {
      const snapshot = await baseVault.listSnapshot();
      controller.abort();
      return snapshot;
    },
  };
  const storage: WorkspaceStorage = {
    ...createStorage({ openPaths: [plan.path] }),
    readWorkspace: () => {
      workspaceReads += 1;
      return { openPaths: [plan.path] };
    },
  };

  await expect(restoreWorkspace(vault, storage, controller.signal)).resolves.toBeNull();
  expect(workspaceReads).toBe(0);
  expect(noteReads).toBe(0);
});
