import { expect, test } from "vitest";

import {
  createWorkspaceStorage,
  type StorageLike,
} from "@/components/vault/workspace-storage";

function createMemoryStorage(): StorageLike & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

test("workspace state round-trips through its versioned storage key", () => {
  const storage = createMemoryStorage();
  const workspaceStorage = createWorkspaceStorage(storage);
  const state = {
    activePath: "Notes/today.md",
    openPaths: ["Notes/today.md"],
    splitRatio: 0.5,
  };

  workspaceStorage.writeWorkspace(state);

  expect(storage.values.get("archeion-workspace-v1")).toBe(JSON.stringify(state));
  expect(workspaceStorage.readWorkspace()).toEqual(state);
});

test("panel preferences preserve current keys and expose the legacy compact fallback", () => {
  const storage = createMemoryStorage();
  const workspaceStorage = createWorkspaceStorage(storage);
  const preferences = {
    position: "left",
    presentation: "expanded",
    size: { horizontal: 320, side: 360 },
  };

  workspaceStorage.writePanelPreferences(preferences);
  storage.setItem("archeion-panel-compact", "true");

  expect(storage.values.get("archeion-panel-position")).toBe("left");
  expect(storage.values.get("archeion-panel-mode-v2")).toBe("expanded");
  expect(storage.values.get("archeion-panel-size-v1")).toBe(JSON.stringify(preferences.size));
  expect(workspaceStorage.readPanelPreferences()).toEqual({
    ...preferences,
    compact: "true",
  });
});

test("library preferences round-trip through the library version key", () => {
  const storage = createMemoryStorage();
  const workspaceStorage = createWorkspaceStorage(storage);
  const preferences = {
    expandedFolders: ["Research"],
    order: ["Research/idea.md"],
    view: "all",
  };

  workspaceStorage.writeLibraryPreferences(preferences);

  expect(storage.values.get("archeion-library-v1")).toBe(JSON.stringify(preferences));
  expect(workspaceStorage.readLibraryPreferences()).toEqual(preferences);
});

test("malformed persisted JSON becomes an empty candidate instead of throwing", () => {
  const storage = createMemoryStorage();
  const workspaceStorage = createWorkspaceStorage(storage);

  storage.setItem("archeion-workspace-v1", "{not-json");
  storage.setItem("archeion-panel-size-v1", "[]");
  storage.setItem("archeion-library-v1", "null");

  expect(workspaceStorage.readWorkspace()).toEqual({});
  expect(workspaceStorage.readPanelPreferences().size).toEqual({});
  expect(workspaceStorage.readLibraryPreferences()).toEqual({});
});
