import { expect, test } from "vitest";

import {
  dockTargetFromPoint,
  dockWorkspaceTab,
  closeWorkspaceTab,
  MAX_WORKSPACE_TABS,
  normalisePaneGeometry,
  pathIsWithin,
  pointIsWithinRect,
  remapPath,
  reorderWorkspacePaths,
  resolveWorkspaceTabDrop,
  removeWorkspaceTarget,
  sanitiseStoredWorkspace,
  tabStripAutoScrollDelta,
  undockWorkspaceTab,
  workspaceTabStripPaths,
} from "@/components/vault/workspace-model";

test("restores the first Note into the active top-left pane when no saved workspace exists", () => {
  const workspace = sanitiseStoredWorkspace(null, [
    { kind: "attachment", path: "reference.pdf" },
    { kind: "note", path: "Welcome.md" },
  ]);

  expect(workspace).toEqual({
    activePath: "Welcome.md",
    focusedPane: "topLeft",
    openPaths: ["Welcome.md"],
    panes: { topLeft: "Welcome.md", topRight: null, bottomLeft: null, bottomRight: null },
    splitRatio: 0.5,
  });
});

test("accepts the parsed candidate returned by the storage Adapter", () => {
  const workspace = sanitiseStoredWorkspace({
    activePath: "Plan.md",
    focusedPane: "topLeft",
    openPaths: ["Plan.md"],
    panes: { topLeft: "Plan.md" },
    splitRatio: 0.6,
  }, [{ kind: "note", path: "Plan.md" }]);

  expect(workspace).toMatchObject({
    activePath: "Plan.md",
    focusedPane: "topLeft",
    openPaths: ["Plan.md"],
    splitRatio: 0.6,
  });
});

test("normalises two diagonally placed panes into a readable top row", () => {
  expect(normalisePaneGeometry({
    topLeft: "Plan.md",
    topRight: null,
    bottomLeft: null,
    bottomRight: "Reference.pdf",
  })).toEqual({
    topLeft: "Plan.md",
    topRight: "Reference.pdf",
    bottomLeft: null,
    bottomRight: null,
  });
});

test("restores only existing tabs, migrates legacy panes, and clamps the split ratio", () => {
  const workspace = sanitiseStoredWorkspace(JSON.stringify({
    activePath: "missing.md",
    focusedPane: "right",
    openPaths: ["missing.md", "Reference.pdf", "Plan.md", "Reference.pdf"],
    panes: { left: "Reference.pdf", right: "Reference.pdf", bottom: "Plan.md" },
    splitRatio: 0.95,
  }), [
    { kind: "note", path: "Plan.md" },
    { kind: "attachment", path: "Reference.pdf" },
  ]);

  expect(workspace).toEqual({
    activePath: "Reference.pdf",
    focusedPane: "topLeft",
    openPaths: ["Reference.pdf", "Plan.md", "Reference.pdf"],
    panes: { topLeft: "Reference.pdf", topRight: null, bottomLeft: "Plan.md", bottomRight: null },
    splitRatio: 0.8,
  });
});

test("restoration uses the same open-tab limit as the live workspace", () => {
  const items = Array.from({ length: MAX_WORKSPACE_TABS + 2 }, (_, index) => ({
    kind: "note" as const,
    path: `Note ${index + 1}.md`,
  }));
  const workspace = sanitiseStoredWorkspace({
    openPaths: items.map((item) => item.path),
  }, items);

  expect(workspace.openPaths).toHaveLength(MAX_WORKSPACE_TABS);
});

test("remaps the most specific renamed folder without confusing similar path prefixes", () => {
  const changes = [
    { from: "Research", to: "Archive" },
    { from: "Research/Week 1", to: "Archive/Week 1" },
  ];

  expect(remapPath("Research/Week 1/Plan.md", changes)).toBe("Archive/Week 1/Plan.md");
  expect(remapPath("Researcher/Plan.md", changes)).toBe("Researcher/Plan.md");
  expect(pathIsWithin("Research/Week 1/Plan.md", "Research")).toBe(true);
  expect(pathIsWithin("Researcher/Plan.md", "Research")).toBe(false);
});

test("chooses the nearest workspace edge as a dock target", () => {
  expect(dockTargetFromPoint(
    { left: 100, top: 200, right: 700, bottom: 600 },
    660,
    380,
  )).toBe("right");
});

test("accepts a tab dropped just beyond the canvas edge but rejects a distant drop", () => {
  const rect = { left: 100, top: 200, right: 700, bottom: 600 };

  expect(pointIsWithinRect(rect, 48, 380, 64, 24)).toBe(true);
  expect(pointIsWithinRect(rect, 20, 380, 64, 24)).toBe(false);
  expect(pointIsWithinRect(rect, 300, 160, 64, 24)).toBe(false);
});

test("reorders a dragged tab before, after, or at the end of the strip", () => {
  const paths = ["Plan.md", "Reference.pdf", "Archive.md"];

  expect(reorderWorkspacePaths(paths, "Archive.md", "Plan.md", "before")).toEqual([
    "Archive.md",
    "Plan.md",
    "Reference.pdf",
  ]);
  expect(reorderWorkspacePaths(paths, "Plan.md", "Reference.pdf", "after")).toEqual([
    "Reference.pdf",
    "Plan.md",
    "Archive.md",
  ]);
  expect(reorderWorkspacePaths(paths, "Plan.md", null, "end")).toEqual([
    "Reference.pdf",
    "Archive.md",
    "Plan.md",
  ]);
});

test("resolves tab drops to one canonical insertion slot", () => {
  const paths = ["A.md", "B.md", "C.md"];

  expect(resolveWorkspaceTabDrop(paths, "A.md", "B.md", "before")).toMatchObject({
    changesOrder: false,
    position: "before",
    targetPath: "B.md",
  });
  expect(resolveWorkspaceTabDrop(paths, "B.md", "A.md", "after")).toMatchObject({
    changesOrder: false,
    position: "before",
    targetPath: "C.md",
  });
  expect(resolveWorkspaceTabDrop(paths, "C.md", null, "end")).toMatchObject({
    changesOrder: false,
    position: "end",
    targetPath: null,
  });

  expect(resolveWorkspaceTabDrop(paths, "C.md", "A.md", "after")).toEqual({
    changesOrder: true,
    paths: ["A.md", "C.md", "B.md"],
    position: "before",
    targetPath: "B.md",
  });
  expect(resolveWorkspaceTabDrop(paths, "A.md", "C.md", "after")).toEqual({
    changesOrder: true,
    paths: ["B.md", "C.md", "A.md"],
    position: "end",
    targetPath: null,
  });
});

test("uses the visual tab-strip order when split tabs are interleaved in storage", () => {
  const storedPaths = ["A.md", "Standalone.md", "B.md", "Tail.md"];
  const stripPaths = workspaceTabStripPaths(storedPaths, ["A.md", "B.md"]);

  expect(stripPaths).toEqual(["A.md", "B.md", "Standalone.md", "Tail.md"]);
  expect(resolveWorkspaceTabDrop(stripPaths, "B.md", "A.md", "after")).toMatchObject({
    changesOrder: false,
    position: "before",
    targetPath: "Standalone.md",
  });
  expect(resolveWorkspaceTabDrop(stripPaths, "B.md", "Standalone.md", "after")).toEqual({
    changesOrder: true,
    paths: ["A.md", "Standalone.md", "B.md", "Tail.md"],
    position: "before",
    targetPath: "Tail.md",
  });
});

test("scrolls an overflowing tab strip only near its horizontal edges", () => {
  const strip = { left: 100, top: 20, right: 500, bottom: 68 };

  expect(tabStripAutoScrollDelta(strip, 108, 44)).toBeLessThan(0);
  expect(tabStripAutoScrollDelta(strip, 492, 44)).toBeGreaterThan(0);
  expect(tabStripAutoScrollDelta(strip, 300, 44)).toBe(0);
  expect(tabStripAutoScrollDelta(strip, 492, 90)).toBe(0);
});

test("docking an open tab creates the requested two-pane arrangement and focuses it", () => {
  const nextWorkspace = dockWorkspaceTab({
    activePath: "Plan.md",
    focusedPane: "topLeft",
    openPaths: ["Plan.md", "Reference.pdf"],
    panes: { topLeft: "Plan.md", topRight: null, bottomLeft: null, bottomRight: null },
    splitRatio: 0.32,
  }, "Reference.pdf", "right");

  expect(nextWorkspace).toEqual({
    activePath: "Reference.pdf",
    focusedPane: "topRight",
    openPaths: ["Plan.md", "Reference.pdf"],
    panes: { topLeft: "Plan.md", topRight: "Reference.pdf", bottomLeft: null, bottomRight: null },
    splitRatio: 0.5,
  });
});

test("closing the active tab selects its next tab and keeps it visible", () => {
  const nextWorkspace = closeWorkspaceTab({
    activePath: "Reference.pdf",
    focusedPane: "topRight",
    openPaths: ["Plan.md", "Reference.pdf", "Archive.md"],
    panes: { topLeft: "Plan.md", topRight: "Reference.pdf", bottomLeft: null, bottomRight: null },
    splitRatio: 0.5,
  }, "Reference.pdf");

  expect(nextWorkspace).toEqual({
    activePath: "Archive.md",
    focusedPane: "topRight",
    openPaths: ["Plan.md", "Archive.md"],
    panes: { topLeft: "Plan.md", topRight: "Archive.md", bottomLeft: null, bottomRight: null },
    splitRatio: 0.5,
  });
});

test("undocking the active tab keeps it open and focuses a remaining pane", () => {
  const nextWorkspace = undockWorkspaceTab({
    activePath: "Reference.pdf",
    focusedPane: "topRight",
    openPaths: ["Plan.md", "Reference.pdf", "Archive.md"],
    panes: { topLeft: "Plan.md", topRight: "Reference.pdf", bottomLeft: null, bottomRight: null },
    splitRatio: 0.6,
  }, "Reference.pdf");

  expect(nextWorkspace).toEqual({
    activePath: "Plan.md",
    focusedPane: "topLeft",
    openPaths: ["Plan.md", "Reference.pdf", "Archive.md"],
    panes: { topLeft: "Plan.md", topRight: null, bottomLeft: null, bottomRight: null },
    splitRatio: 0.6,
  });
});

test("undocking an inactive tab preserves the active pane and tab order", () => {
  const nextWorkspace = undockWorkspaceTab({
    activePath: "Plan.md",
    focusedPane: "topLeft",
    openPaths: ["Plan.md", "Reference.pdf", "Archive.md"],
    panes: {
      topLeft: "Plan.md",
      topRight: "Reference.pdf",
      bottomLeft: "Archive.md",
      bottomRight: null,
    },
    splitRatio: 0.4,
  }, "Reference.pdf");

  expect(nextWorkspace).toEqual({
    activePath: "Plan.md",
    focusedPane: "topLeft",
    openPaths: ["Plan.md", "Reference.pdf", "Archive.md"],
    panes: { topLeft: "Plan.md", topRight: null, bottomLeft: "Archive.md", bottomRight: null },
    splitRatio: 0.4,
  });
});

test("undocking an inactive tab from four panes leaves the other slots intact", () => {
  const nextWorkspace = undockWorkspaceTab({
    activePath: "Plan.md",
    focusedPane: "topLeft",
    openPaths: ["Plan.md", "Reference.pdf", "Archive.md", "Notes.md"],
    panes: {
      topLeft: "Plan.md",
      topRight: "Reference.pdf",
      bottomLeft: "Archive.md",
      bottomRight: "Notes.md",
    },
    splitRatio: 0.5,
  }, "Reference.pdf");

  expect(nextWorkspace.panes).toEqual({
    topLeft: "Plan.md",
    topRight: null,
    bottomLeft: "Archive.md",
    bottomRight: "Notes.md",
  });
  expect(nextWorkspace.activePath).toBe("Plan.md");
  expect(nextWorkspace.focusedPane).toBe("topLeft");
  expect(nextWorkspace.openPaths).toEqual(["Plan.md", "Reference.pdf", "Archive.md", "Notes.md"]);
});

test("undocking the active tab from four panes focuses the first remaining pane", () => {
  const nextWorkspace = undockWorkspaceTab({
    activePath: "Notes.md",
    focusedPane: "bottomRight",
    openPaths: ["Plan.md", "Reference.pdf", "Archive.md", "Notes.md"],
    panes: {
      topLeft: "Plan.md",
      topRight: "Reference.pdf",
      bottomLeft: "Archive.md",
      bottomRight: "Notes.md",
    },
    splitRatio: 0.5,
  }, "Notes.md");

  expect(nextWorkspace.panes).toEqual({
    topLeft: "Plan.md",
    topRight: "Reference.pdf",
    bottomLeft: "Archive.md",
    bottomRight: null,
  });
  expect(nextWorkspace.activePath).toBe("Plan.md");
  expect(nextWorkspace.focusedPane).toBe("topLeft");
  expect(nextWorkspace.openPaths).toEqual(["Plan.md", "Reference.pdf", "Archive.md", "Notes.md"]);
});

test("undocking ignores a standalone tab or a single-pane workspace", () => {
  const workspace = {
    activePath: "Plan.md",
    focusedPane: "topLeft" as const,
    openPaths: ["Plan.md", "Reference.pdf"],
    panes: { topLeft: "Plan.md", topRight: null, bottomLeft: null, bottomRight: null },
    splitRatio: 0.5,
  };

  expect(undockWorkspaceTab(workspace, "Reference.pdf")).toBe(workspace);
  expect(undockWorkspaceTab(workspace, "Plan.md")).toBe(workspace);
});

test("removing a folder clears all of its tabs and focuses the first remaining tab", () => {
  expect(removeWorkspaceTarget({
    activePath: "Research/Plan.md",
    focusedPane: "topLeft",
    openPaths: ["Research/Plan.md", "Inbox.md", "Research/Reference.pdf"],
    panes: {
      topLeft: "Research/Plan.md",
      topRight: "Inbox.md",
      bottomLeft: "Research/Reference.pdf",
      bottomRight: null,
    },
    splitRatio: 0.5,
  }, { kind: "folder", path: "Research" })).toEqual({
    activePath: "Inbox.md",
    focusedPane: "topRight",
    openPaths: ["Inbox.md"],
    panes: { topLeft: null, topRight: "Inbox.md", bottomLeft: null, bottomRight: null },
    splitRatio: 0.5,
  });
});
