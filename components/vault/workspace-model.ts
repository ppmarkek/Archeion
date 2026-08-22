export type EditorMode = "edit" | "split" | "preview";

export type PaneSlot = "topLeft" | "topRight" | "bottomLeft" | "bottomRight";

export type PaneTabs = Record<PaneSlot, string | null>;

export type DockTarget = "left" | "right" | "top" | "bottom";

export type WorkspaceTabDropPosition = "after" | "before" | "end";

export type ResolvedWorkspaceTabDrop = {
  changesOrder: boolean;
  paths: readonly string[];
  position: "before" | "end";
  targetPath: string | null;
};

export type RectLike = {
  bottom: number;
  left: number;
  right: number;
  top: number;
};

export type WorkspaceItem = {
  kind: "note" | "attachment";
  path: string;
};

export type WorkspaceTab<Item extends WorkspaceItem = WorkspaceItem> = {
  content: string;
  editorMode: EditorMode;
  isLoading: boolean;
  item: Item;
  savedContent: string;
};

export type WorkspaceState = {
  activePath: string | null;
  focusedPane: PaneSlot;
  openPaths: string[];
  panes: PaneTabs;
  splitRatio: number;
};

export type WorkspaceRemovalTarget = {
  kind: "file" | "folder";
  path: string;
};

export const MAX_WORKSPACE_TABS = 8;

type StoredWorkspace = {
  activePath?: unknown;
  focusedPane?: unknown;
  openPaths?: unknown;
  panes?: unknown;
  splitRatio?: unknown;
};

export const paneSlots: readonly PaneSlot[] = ["topLeft", "topRight", "bottomLeft", "bottomRight"];

export const emptyPaneTabs: PaneTabs = {
  bottomLeft: null,
  bottomRight: null,
  topLeft: null,
  topRight: null,
};

const dockTargetSlots: Record<DockTarget, readonly [PaneSlot, PaneSlot]> = {
  bottom: ["bottomLeft", "topLeft"],
  left: ["topLeft", "topRight"],
  right: ["topRight", "topLeft"],
  top: ["topLeft", "bottomLeft"],
};

const dockEdgeSlots: Record<DockTarget, readonly PaneSlot[]> = {
  bottom: ["bottomLeft", "bottomRight"],
  left: ["topLeft", "bottomLeft"],
  right: ["topRight", "bottomRight"],
  top: ["topLeft", "topRight"],
};

export function paneForPath(panes: PaneTabs, path: string): PaneSlot | null {
  return paneSlots.find((slot) => panes[slot] === path) ?? null;
}

export function visiblePaneCount(panes: PaneTabs): number {
  return paneSlots.reduce((count, slot) => count + (panes[slot] ? 1 : 0), 0);
}

export type PathChange = {
  from: string;
  to: string;
};

export function remapPath(path: string, changes: readonly PathChange[]): string {
  const orderedChanges = [...changes].sort((left, right) => right.from.length - left.from.length);
  const change = orderedChanges.find(({ from }) => path === from || path.startsWith(`${from}/`));
  if (!change) return path;
  return path === change.from ? change.to : `${change.to}${path.slice(change.from.length)}`;
}

export function pathIsWithin(path: string, parent: string): boolean {
  return path === parent || path.startsWith(`${parent}/`);
}

export function dockTargetFromPoint(rect: RectLike, clientX: number, clientY: number): DockTarget {
  const distances: Record<DockTarget, number> = {
    bottom: rect.bottom - clientY,
    left: clientX - rect.left,
    right: rect.right - clientX,
    top: clientY - rect.top,
  };

  return (Object.entries(distances) as Array<[DockTarget, number]>).reduce(
    (nearest, candidate) => candidate[1] < nearest[1] ? candidate : nearest,
  )[0];
}

export function pointIsWithinRect(
  rect: RectLike,
  clientX: number,
  clientY: number,
  horizontalMargin = 0,
  verticalMargin = horizontalMargin,
): boolean {
  return clientX >= rect.left - horizontalMargin
    && clientX <= rect.right + horizontalMargin
    && clientY >= rect.top - verticalMargin
    && clientY <= rect.bottom + verticalMargin;
}

export function tabStripAutoScrollDelta(
  rect: RectLike,
  clientX: number,
  clientY: number,
  edgeSize = 48,
  maximumDelta = 18,
): number {
  if (clientY < rect.top || clientY > rect.bottom || clientX < rect.left || clientX > rect.right) return 0;
  if (clientX < rect.left + edgeSize) {
    return -Math.ceil(maximumDelta * (1 - (clientX - rect.left) / edgeSize));
  }
  if (clientX > rect.right - edgeSize) {
    return Math.ceil(maximumDelta * (1 - (rect.right - clientX) / edgeSize));
  }
  return 0;
}

export function reorderWorkspacePaths(
  paths: readonly string[],
  draggedPath: string,
  targetPath: string | null,
  position: WorkspaceTabDropPosition,
): readonly string[] {
  const sourceIndex = paths.indexOf(draggedPath);
  if (sourceIndex < 0) return paths;

  const reordered = paths.filter((_, index) => index !== sourceIndex);
  if (position === "end") return [...reordered, draggedPath];
  if (!targetPath || targetPath === draggedPath) return paths;

  const targetIndex = reordered.indexOf(targetPath);
  if (targetIndex < 0) return paths;
  reordered.splice(targetIndex + (position === "after" ? 1 : 0), 0, draggedPath);
  return reordered;
}

export function workspaceTabStripPaths(
  paths: readonly string[],
  groupedPaths: readonly string[],
): readonly string[] {
  const groupedPathSet = new Set(groupedPaths);
  const firstGroupedIndex = paths.findIndex((path) => groupedPathSet.has(path));
  if (firstGroupedIndex < 0) return paths;

  return [
    ...paths.slice(0, firstGroupedIndex).filter((path) => !groupedPathSet.has(path)),
    ...paths.filter((path) => groupedPathSet.has(path)),
    ...paths.slice(firstGroupedIndex).filter((path) => !groupedPathSet.has(path)),
  ];
}

export function resolveWorkspaceTabDrop(
  paths: readonly string[],
  draggedPath: string,
  targetPath: string | null,
  position: WorkspaceTabDropPosition,
): ResolvedWorkspaceTabDrop | null {
  if (!paths.includes(draggedPath)) return null;
  if (position !== "end" && (!targetPath || targetPath === draggedPath || !paths.includes(targetPath))) {
    return null;
  }

  const reorderedPaths = reorderWorkspacePaths(paths, draggedPath, targetPath, position);
  const draggedIndex = reorderedPaths.indexOf(draggedPath);
  if (draggedIndex < 0) return null;

  const nextPath = reorderedPaths[draggedIndex + 1] ?? null;
  return {
    changesOrder: reorderedPaths.some((candidate, index) => candidate !== paths[index]),
    paths: reorderedPaths,
    position: nextPath ? "before" : "end",
    targetPath: nextPath,
  };
}

export function normalisePaneGeometry(panes: PaneTabs): PaneTabs {
  if (visiblePaneCount(panes) !== 2) return panes;

  if (panes.topLeft && panes.bottomRight) {
    return { ...emptyPaneTabs, topLeft: panes.topLeft, topRight: panes.bottomRight };
  }

  if (panes.topRight && panes.bottomLeft) {
    return { ...emptyPaneTabs, topLeft: panes.bottomLeft, topRight: panes.topRight };
  }

  return panes;
}

export function dockWorkspaceTab(workspace: WorkspaceState, path: string, target: DockTarget): WorkspaceState {
  if (workspace.openPaths.length < 2) return workspace;

  const panes = normalisePaneGeometry(workspace.panes);
  const source = paneForPath(panes, path);
  const [primarySlot, companionSlot] = dockTargetSlots[target];
  const edgeSlots = dockEdgeSlots[target];
  let nextPanes: PaneTabs;

  if (visiblePaneCount(panes) <= 1) {
    const companionPath = workspace.openPaths.find((candidate) => candidate !== path) ?? null;
    if (!companionPath) return workspace;
    nextPanes = { ...emptyPaneTabs, [primarySlot]: path, [companionSlot]: companionPath };
  } else if (visiblePaneCount(panes) === 2 && source) {
    const companionPath = paneSlots.map((slot) => panes[slot]).find((panePath) => panePath && panePath !== path) ?? null;
    nextPanes = { ...emptyPaneTabs, [primarySlot]: path, [companionSlot]: companionPath };
  } else {
    nextPanes = { ...panes };
    let destination = edgeSlots.find((slot) => nextPanes[slot] === path)
      ?? edgeSlots.find((slot) => !nextPanes[slot])
      ?? paneSlots.find((slot) => !nextPanes[slot])
      ?? null;

    if (!destination && !source) return workspace;

    destination ??= primarySlot;
    if (source && source !== destination) {
      const displacedPath = nextPanes[destination];
      nextPanes[destination] = path;
      nextPanes[source] = displacedPath ?? null;
    } else {
      nextPanes[destination] = path;
    }
  }

  return {
    ...workspace,
    activePath: path,
    focusedPane: primarySlot,
    panes: normalisePaneGeometry(nextPanes),
    splitRatio: 0.5,
  };
}

export function undockWorkspaceTab(workspace: WorkspaceState, path: string): WorkspaceState {
  const source = paneForPath(workspace.panes, path);
  if (!source || visiblePaneCount(workspace.panes) <= 1) return workspace;

  const panes = normalisePaneGeometry({ ...workspace.panes, [source]: null });
  if (workspace.activePath !== path) {
    return {
      ...workspace,
      focusedPane: panes[workspace.focusedPane]
        ? workspace.focusedPane
        : paneForPath(panes, workspace.activePath ?? "") ?? "topLeft",
      panes,
    };
  }

  const focusedPane = paneSlots.find((slot) => panes[slot]) ?? "topLeft";
  return {
    ...workspace,
    activePath: panes[focusedPane],
    focusedPane,
    panes,
  };
}

export function closeWorkspaceTab(workspace: WorkspaceState, path: string): WorkspaceState {
  const closingIndex = workspace.openPaths.indexOf(path);
  if (closingIndex < 0) return workspace;

  const openPaths = workspace.openPaths.filter((candidate) => candidate !== path);
  const nextActivePath = openPaths[Math.min(closingIndex, openPaths.length - 1)] ?? null;
  const nextPanes = paneSlots.reduce<PaneTabs>((next, slot) => ({
    ...next,
    [slot]: workspace.panes[slot] === path ? null : workspace.panes[slot],
  }), { ...emptyPaneTabs });

  if (!paneForPath(nextPanes, nextActivePath ?? "") && nextActivePath) {
    const activePane = paneForPath(nextPanes, nextActivePath);
    if (activePane) nextPanes[activePane] = null;
    nextPanes[paneSlots.find((slot) => !nextPanes[slot]) ?? "topLeft"] = nextActivePath;
  }

  if (workspace.activePath !== path) {
    return { ...workspace, openPaths, panes: normalisePaneGeometry(nextPanes) };
  }

  return {
    ...workspace,
    activePath: nextActivePath,
    focusedPane: paneForPath(nextPanes, nextActivePath ?? "") ?? "topLeft",
    openPaths,
    panes: normalisePaneGeometry(nextPanes),
  };
}

export function removeWorkspaceTarget(
  workspace: WorkspaceState,
  target: WorkspaceRemovalTarget,
): WorkspaceState {
  const isRemoved = (path: string) => target.kind === "folder" ? pathIsWithin(path, target.path) : path === target.path;
  const openPaths = workspace.openPaths.filter((path) => !isRemoved(path));
  const activePath = workspace.activePath && !isRemoved(workspace.activePath)
    ? workspace.activePath
    : openPaths[0] ?? null;
  const panes = paneSlots.reduce<PaneTabs>((next, slot) => ({
    ...next,
    [slot]: workspace.panes[slot] && !isRemoved(workspace.panes[slot]) ? workspace.panes[slot] : null,
  }), { ...emptyPaneTabs });

  if (!paneForPath(panes, activePath ?? "") && activePath) {
    const activePane = paneForPath(panes, activePath);
    if (activePane) panes[activePane] = null;
    panes[paneSlots.find((slot) => !panes[slot]) ?? "topLeft"] = activePath;
  }

  return {
    ...workspace,
    activePath,
    focusedPane: paneForPath(panes, activePath ?? "") ?? "topLeft",
    openPaths,
    panes: normalisePaneGeometry(panes),
  };
}

export function sanitiseStoredWorkspace(value: unknown, items: readonly WorkspaceItem[]): WorkspaceState {
  let stored: StoredWorkspace = {};
  try {
    const candidate = typeof value === "string" ? JSON.parse(value) as unknown : value;
    stored = candidate !== null && typeof candidate === "object" && !Array.isArray(candidate)
      ? candidate as StoredWorkspace
      : {};
  } catch {
    stored = {};
  }

  const itemPaths = new Set(items.map((item) => item.path));
  const openPaths = Array.isArray(stored.openPaths)
    ? stored.openPaths
      .filter((path): path is string => typeof path === "string" && itemPaths.has(path))
      .slice(0, MAX_WORKSPACE_TABS)
    : [];

  if (openPaths.length === 0) {
    const firstItem = items.find((item) => item.kind === "note") ?? items[0];
    if (firstItem) openPaths.push(firstItem.path);
  }

  const activePath = typeof stored.activePath === "string" && openPaths.includes(stored.activePath)
    ? stored.activePath
    : openPaths[0] ?? null;
  const storedPanes = stored.panes && typeof stored.panes === "object"
    ? stored.panes as Record<string, unknown>
    : {};
  const panes = { ...emptyPaneTabs };
  const claimedPaths = new Set<string>();
  const claimPane = (slot: PaneSlot, candidate: unknown) => {
    if (typeof candidate !== "string" || !openPaths.includes(candidate) || claimedPaths.has(candidate)) return;
    panes[slot] = candidate;
    claimedPaths.add(candidate);
  };

  for (const slot of paneSlots) claimPane(slot, storedPanes[slot]);
  if (visiblePaneCount(panes) === 0) {
    const center = typeof storedPanes.center === "string" && openPaths.includes(storedPanes.center)
      ? storedPanes.center
      : activePath;

    if (typeof center === "string") claimPane("topLeft", center);
    claimPane("topLeft", storedPanes.left);
    claimPane("topRight", storedPanes.right);
    claimPane("bottomLeft", storedPanes.bottom);
    claimPane("topLeft", storedPanes.top);
  }

  if (activePath && !paneForPath(panes, activePath)) {
    panes[paneSlots.find((slot) => !panes[slot]) ?? "topLeft"] = activePath;
  }

  const legacyFocusedSlot: PaneSlot | null = stored.focusedPane === "right"
    ? "topRight"
    : stored.focusedPane === "bottom"
      ? "bottomLeft"
      : stored.focusedPane === "top" || stored.focusedPane === "left" || stored.focusedPane === "center"
        ? "topLeft"
        : null;
  const normalisedPanes = normalisePaneGeometry(panes);
  const focusedPane = isPaneSlot(stored.focusedPane) && normalisedPanes[stored.focusedPane]
    ? stored.focusedPane
    : legacyFocusedSlot && normalisedPanes[legacyFocusedSlot]
      ? legacyFocusedSlot
      : paneForPath(normalisedPanes, activePath ?? "") ?? "topLeft";
  const splitRatio = typeof stored.splitRatio === "number" && Number.isFinite(stored.splitRatio)
    ? Math.min(0.8, Math.max(0.2, stored.splitRatio))
    : 0.5;

  return {
    activePath,
    focusedPane,
    openPaths,
    panes: normalisedPanes,
    splitRatio,
  };
}

function isPaneSlot(value: unknown): value is PaneSlot {
  return paneSlots.includes(value as PaneSlot);
}
