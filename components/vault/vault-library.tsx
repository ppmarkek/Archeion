"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  ArcheionMark,
  AttachmentIcon,
  BookIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  CollectionIcon,
  EditIcon,
  FileDocumentPlusIcon,
  FolderIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  HomeIcon,
  LoadingIcon,
  SearchIcon,
  TrashIcon,
  UploadIcon,
} from "@/components/vault/vault-icons";
import { cn } from "@/lib/utils";

export type VaultLibraryPresentation = "expanded" | "compact" | "hidden";
export type VaultLibraryView = "tree" | "all";
export type VaultLibraryNodeKind = "file" | "folder";
export type VaultLibrarySearchMatch = "name" | "path" | "content";

export type VaultLibraryItem = {
  path: string;
  name: string;
  kind: "note" | "attachment";
  mimeType: string;
  size: number;
  updatedAt: string;
};

export type VaultLibrarySearchResult = {
  item: VaultLibraryItem;
  match: VaultLibrarySearchMatch;
  snippet?: string;
};

export type VaultLibraryCreateInput = {
  directory: string;
  name: string;
};

export type VaultLibraryTarget = {
  path: string;
  kind: VaultLibraryNodeKind;
};

export type VaultLibraryMoveInput = VaultLibraryTarget & {
  destination: string;
  beforePath?: string;
};

export type VaultLibraryProps = {
  items: readonly VaultLibraryItem[];
  folders: readonly string[];
  selectedPath?: string | null;
  openPaths?: readonly string[];
  presentation: VaultLibraryPresentation;
  onPresentationChange: (presentation: VaultLibraryPresentation) => void;
  view?: VaultLibraryView;
  onViewChange?: (view: VaultLibraryView) => void;
  expandedFolders?: readonly string[];
  onExpandedFoldersChange?: (folders: string[]) => void;
  order?: readonly string[];
  onOrderChange?: (paths: string[]) => void;
  isLoading?: boolean;
  busyPaths?: readonly string[];
  errorMessage?: string | null;
  className?: string;
  title?: string;
  edge?: "left" | "right";
  orientation?: "vertical" | "horizontal";
  settings?: React.ReactNode;
  searchDebounceMs?: number;
  onOpenItem: (item: VaultLibraryItem) => void | Promise<void>;
  onCreateNote: (input: VaultLibraryCreateInput) => void | Promise<void>;
  onCreateFolder: (input: VaultLibraryCreateInput) => void | Promise<void>;
  onRename: (target: VaultLibraryTarget, name: string) => void | Promise<void>;
  onMove: (input: VaultLibraryMoveInput) => void | Promise<void>;
  onDelete: (target: VaultLibraryTarget) => void | Promise<void>;
  onSearch?: (query: string) => Promise<readonly VaultLibrarySearchResult[]>;
  onImport?: (directory: string) => void;
  onPreviewItem?: (item: VaultLibraryItem, target: HTMLButtonElement) => void;
  onPreviewEnd?: () => void;
};

type LibraryNode =
  | {
      kind: "folder";
      name: string;
      path: string;
    }
  | {
      item: VaultLibraryItem;
      kind: "file";
      name: string;
      path: string;
    };

type ContextTarget = VaultLibraryTarget | { kind: "root"; path: "" };

type ContextMenuState = {
  target: ContextTarget;
  x: number;
  y: number;
};

type ActionState =
  | { directory: string; type: "create-note" }
  | { directory: string; type: "create-folder" }
  | { target: VaultLibraryTarget; type: "rename" }
  | { target: VaultLibraryTarget; type: "move" }
  | { target: VaultLibraryTarget; type: "delete" };

type DropState = {
  path: string;
  position: "before" | "inside" | "after";
};

const ROOT_TARGET: ContextTarget = { kind: "root", path: "" };
const SEARCH_SHORTCUT = "k";
const SEARCH_RESULT_LIMIT = 100;
const SCROLLBAR_HIDE_DELAY_MS = 700;
const SCROLLBAR_FADE_MS = 180;
const scrollbarTimers = new WeakMap<HTMLElement, { fade?: number; hide?: number }>();

function revealScrollbar(element: HTMLElement) {
  const timers = scrollbarTimers.get(element) ?? {};
  if (timers.hide !== undefined) window.clearTimeout(timers.hide);
  if (timers.fade !== undefined) window.clearTimeout(timers.fade);

  element.dataset.scrolling = "true";
  delete element.dataset.scrollbarLeaving;
  timers.hide = window.setTimeout(() => {
    delete element.dataset.scrolling;
    element.dataset.scrollbarLeaving = "true";
    timers.fade = window.setTimeout(() => {
      delete element.dataset.scrollbarLeaving;
      scrollbarTimers.delete(element);
    }, SCROLLBAR_FADE_MS);
  }, SCROLLBAR_HIDE_DELAY_MS);
  scrollbarTimers.set(element, timers);
}

function normalisePath(value: string) {
  return value.trim().replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
}

function parentFolder(path: string) {
  const normalised = normalisePath(path);
  const lastSlash = normalised.lastIndexOf("/");
  return lastSlash === -1 ? "" : normalised.slice(0, lastSlash);
}

function baseName(path: string) {
  return normalisePath(path).split("/").at(-1) ?? path;
}

function displayItemName(item: VaultLibraryItem) {
  return item.kind === "note" ? item.name.replace(/\.md$/i, "") : item.name;
}

function folderDisplayName(path: string) {
  const name = baseName(path);
  return name === "attachments" ? "Вложения" : name;
}

function collectFolderPaths(items: readonly VaultLibraryItem[], folders: readonly string[]) {
  const result = new Set<string>();

  function addWithAncestors(rawPath: string) {
    const path = normalisePath(rawPath);
    if (!path) return;
    const parts = path.split("/");
    parts.forEach((_, index) => result.add(parts.slice(0, index + 1).join("/")));
  }

  folders.forEach(addWithAncestors);
  items.forEach((item) => addWithAncestors(parentFolder(item.path)));

  return [...result];
}

function nodeTarget(node: LibraryNode): VaultLibraryTarget {
  return { kind: node.kind, path: node.path };
}

function contextDirectory(target: ContextTarget) {
  if (target.kind === "root") return "";
  return target.kind === "folder" ? target.path : parentFolder(target.path);
}

function searchMatchLabel(match: VaultLibrarySearchMatch) {
  if (match === "content") return "В тексте";
  if (match === "path") return "В пути";
  return "В названии";
}

function resultKey(result: VaultLibrarySearchResult) {
  return `${result.item.path}:${result.match}:${result.snippet ?? ""}`;
}

function targetIsBusy(target: VaultLibraryTarget, busyPaths: ReadonlySet<string>) {
  if (busyPaths.has(target.path)) return true;
  if (target.kind !== "folder") return false;
  return [...busyPaths].some((path) => path.startsWith(`${target.path}/`));
}

function targetLabel(target: VaultLibraryTarget, items: readonly VaultLibraryItem[]) {
  if (target.kind === "folder") return folderDisplayName(target.path);
  const item = items.find((candidate) => candidate.path === target.path);
  return item ? displayItemName(item) : baseName(target.path);
}

function targetInputName(target: VaultLibraryTarget, items: readonly VaultLibraryItem[]) {
  if (target.kind === "folder") return baseName(target.path);
  return items.find((item) => item.path === target.path)?.name ?? baseName(target.path);
}

function highlightText(value: string, query: string) {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return value;

  const lowerValue = value.toLocaleLowerCase("ru");
  const lowerQuery = trimmedQuery.toLocaleLowerCase("ru");
  const result: React.ReactNode[] = [];
  let cursor = 0;
  let index = lowerValue.indexOf(lowerQuery);

  while (index !== -1) {
    if (index > cursor) result.push(value.slice(cursor, index));
    result.push(
      <mark className="rounded-[2px] bg-primary/15 px-0.5 text-inherit" key={`${index}-${cursor}`}>
        {value.slice(index, index + trimmedQuery.length)}
      </mark>,
    );
    cursor = index + trimmedQuery.length;
    index = lowerValue.indexOf(lowerQuery, cursor);
  }

  if (cursor < value.length) result.push(value.slice(cursor));
  return result.length > 0 ? result : value;
}

function stableOrder(paths: readonly string[], allPaths: readonly string[]) {
  const available = new Set(allPaths);
  const seen = new Set<string>();
  const result: string[] = [];

  paths.forEach((path) => {
    if (!available.has(path) || seen.has(path)) return;
    seen.add(path);
    result.push(path);
  });
  allPaths.forEach((path) => {
    if (seen.has(path)) return;
    seen.add(path);
    result.push(path);
  });
  return result;
}

function errorText(error: unknown) {
  return error instanceof Error && error.message ? error.message : "Не удалось выполнить действие.";
}

function useControllableList(
  controlled: readonly string[] | undefined,
  onChange: ((next: string[]) => void) | undefined,
) {
  const [internal, setInternal] = React.useState<string[]>([]);
  const value = controlled ? [...controlled] : internal;

  const update = React.useCallback((next: string[]) => {
    if (controlled === undefined) setInternal(next);
    onChange?.(next);
  }, [controlled, onChange]);

  return [value, update] as const;
}

function useControllableView(
  controlled: VaultLibraryView | undefined,
  onChange: ((next: VaultLibraryView) => void) | undefined,
) {
  const [internal, setInternal] = React.useState<VaultLibraryView>("tree");
  const value = controlled ?? internal;

  const update = React.useCallback((next: VaultLibraryView) => {
    if (controlled === undefined) setInternal(next);
    onChange?.(next);
  }, [controlled, onChange]);

  return [value, update] as const;
}

function VaultLibrary({
  items,
  folders,
  selectedPath = null,
  openPaths = [],
  presentation,
  onPresentationChange,
  view: controlledView,
  onViewChange,
  expandedFolders: controlledExpandedFolders,
  onExpandedFoldersChange,
  order: controlledOrder,
  onOrderChange,
  isLoading = false,
  busyPaths = [],
  errorMessage = null,
  className,
  title = "Vault",
  edge = "right",
  orientation = "vertical",
  settings,
  searchDebounceMs = 160,
  onOpenItem,
  onCreateNote,
  onCreateFolder,
  onRename,
  onMove,
  onDelete,
  onSearch,
  onImport,
  onPreviewItem,
  onPreviewEnd,
}: VaultLibraryProps) {
  const searchInputId = React.useId();
  const actionInputId = React.useId();
  const moveSelectId = React.useId();
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const searchRequestRef = React.useRef(0);
  const [view, setView] = useControllableView(controlledView, onViewChange);
  const [expandedFolders, setExpandedFolders] = useControllableList(
    controlledExpandedFolders,
    onExpandedFoldersChange,
  );
  const [order, setOrder] = useControllableList(controlledOrder, onOrderChange);
  const [query, setQuery] = React.useState("");
  const [searchResults, setSearchResults] = React.useState<readonly VaultLibrarySearchResult[]>([]);
  const [isSearching, setIsSearching] = React.useState(false);
  const [searchError, setSearchError] = React.useState<string | null>(null);
  const [contextMenu, setContextMenu] = React.useState<ContextMenuState | null>(null);
  const [action, setAction] = React.useState<ActionState | null>(null);
  const [actionValue, setActionValue] = React.useState("");
  const [moveDestination, setMoveDestination] = React.useState("");
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [isActing, setIsActing] = React.useState(false);
  const [activeDirectory, setActiveDirectory] = React.useState("");
  const [focusedPath, setFocusedPath] = React.useState<string | null>(selectedPath);
  const [draggedTarget, setDraggedTarget] = React.useState<VaultLibraryTarget | null>(null);
  const [dropState, setDropState] = React.useState<DropState | null>(null);
  const [interactionMessage, setInteractionMessage] = React.useState("");

  const folderPaths = React.useMemo(
    () => collectFolderPaths(items, folders),
    [folders, items],
  );
  const folderSet = React.useMemo(() => new Set(folderPaths), [folderPaths]);
  const openPathSet = React.useMemo(() => new Set(openPaths), [openPaths]);
  const busyPathSet = React.useMemo(() => new Set(busyPaths), [busyPaths]);
  const expandedFolderSet = React.useMemo(() => new Set(expandedFolders), [expandedFolders]);
  const allNodePaths = React.useMemo(
    () => [...folderPaths, ...items.map((item) => item.path)],
    [folderPaths, items],
  );
  const orderedPaths = React.useMemo(
    () => stableOrder(order, allNodePaths),
    [allNodePaths, order],
  );
  const orderRank = React.useMemo(
    () => new Map(order.map((path, index) => [path, index])),
    [order],
  );

  const nodesByDirectory = React.useMemo(() => {
    const result = new Map<string, LibraryNode[]>();

    function addNode(directory: string, node: LibraryNode) {
      const nodes = result.get(directory) ?? [];
      nodes.push(node);
      result.set(directory, nodes);
    }

    folderPaths.forEach((path) => {
      addNode(parentFolder(path), {
        kind: "folder" as const,
        name: folderDisplayName(path),
        path,
      });
    });
    items.forEach((item) => {
      addNode(parentFolder(item.path), {
        item,
        kind: "file" as const,
        name: displayItemName(item),
        path: item.path,
      });
    });

    result.forEach((nodes) => {
      nodes.sort((left, right) => {
        const leftRank = orderRank.get(left.path) ?? Number.MAX_SAFE_INTEGER;
        const rightRank = orderRank.get(right.path) ?? Number.MAX_SAFE_INTEGER;
        if (leftRank !== rightRank) return leftRank - rightRank;
        if (left.kind !== right.kind) return left.kind === "folder" ? -1 : 1;
        return left.name.localeCompare(right.name, "ru", { numeric: true, sensitivity: "base" });
      });
    });

    return result;
  }, [folderPaths, items, orderRank]);

  const directNodes = React.useCallback(
    (directory: string) => nodesByDirectory.get(directory) ?? [],
    [nodesByDirectory],
  );

  const folderFileCountByPath = React.useMemo(() => {
    const counts = new Map<string, number>();
    items.forEach((item) => {
      let directory = parentFolder(item.path);
      while (directory) {
        counts.set(directory, (counts.get(directory) ?? 0) + 1);
        directory = parentFolder(directory);
      }
    });
    return counts;
  }, [items]);

  const visibleTreeNodes = React.useMemo(() => {
    const result: Array<{ depth: number; node: LibraryNode }> = [];

    function visit(directory: string, depth: number) {
      directNodes(directory).forEach((node) => {
        result.push({ depth, node });
        if (node.kind === "folder" && expandedFolderSet.has(node.path)) visit(node.path, depth + 1);
      });
    }

    visit("", 0);
    return result;
  }, [directNodes, expandedFolderSet]);

  const allFileNodes = React.useMemo(() => items
    .map<LibraryNode>((item) => ({
      item,
      kind: "file",
      name: displayItemName(item),
      path: item.path,
    }))
    .sort((left, right) => {
      const leftRank = orderRank.get(left.path) ?? Number.MAX_SAFE_INTEGER;
      const rightRank = orderRank.get(right.path) ?? Number.MAX_SAFE_INTEGER;
      return leftRank - rightRank || left.name.localeCompare(right.name, "ru", { numeric: true });
    }), [items, orderRank]);

  const trimmedQuery = query.trim();
  const isSearchMode = trimmedQuery.length > 0;
  const visiblePaths = React.useMemo(() => {
    if (isSearchMode) return searchResults.map((result) => result.item.path);
    if (view === "all") return allFileNodes.map((node) => node.path);
    return visibleTreeNodes.map(({ node }) => node.path);
  }, [allFileNodes, isSearchMode, searchResults, view, visibleTreeNodes]);
  const tabStopPath = focusedPath && visiblePaths.includes(focusedPath)
    ? focusedPath
    : selectedPath && visiblePaths.includes(selectedPath)
      ? selectedPath
      : visiblePaths[0];

  React.useEffect(() => {
    function focusSearch(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.key.toLocaleLowerCase() !== SEARCH_SHORTCUT) return;
      event.preventDefault();
      if (presentation !== "expanded") onPresentationChange("expanded");
      window.requestAnimationFrame(() => searchInputRef.current?.focus());
    }

    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, [onPresentationChange, presentation]);

  React.useEffect(() => {
    const searchQuery = query.trim();
    const requestId = searchRequestRef.current + 1;
    searchRequestRef.current = requestId;

    if (!searchQuery) {
      const frame = window.requestAnimationFrame(() => {
        setSearchResults([]);
        setSearchError(null);
        setIsSearching(false);
      });
      return () => window.cancelAnimationFrame(frame);
    }

    const timeout = window.setTimeout(async () => {
      setIsSearching(true);
      setSearchError(null);

      try {
        const results = onSearch
          ? await onSearch(searchQuery)
          : items
              .filter((item) => item.name.toLocaleLowerCase("ru").includes(searchQuery.toLocaleLowerCase("ru"))
                || item.path.toLocaleLowerCase("ru").includes(searchQuery.toLocaleLowerCase("ru")))
              .map<VaultLibrarySearchResult>((item) => ({
                item,
                match: item.name.toLocaleLowerCase("ru").includes(searchQuery.toLocaleLowerCase("ru")) ? "name" : "path",
              }));

        if (searchRequestRef.current !== requestId) return;
        setSearchResults(results.slice(0, SEARCH_RESULT_LIMIT));
      } catch (error) {
        if (searchRequestRef.current !== requestId) return;
        setSearchResults([]);
        setSearchError(errorText(error));
      } finally {
        if (searchRequestRef.current === requestId) setIsSearching(false);
      }
    }, searchDebounceMs);

    return () => window.clearTimeout(timeout);
  }, [items, onSearch, query, searchDebounceMs]);

  React.useEffect(() => {
    if (!activeDirectory || folderSet.has(activeDirectory)) return;
    const frame = window.requestAnimationFrame(() => setActiveDirectory(""));
    return () => window.cancelAnimationFrame(frame);
  }, [activeDirectory, folderSet]);

  function focusRow(path: string | undefined) {
    if (!path) return;
    const row = [...document.querySelectorAll<HTMLButtonElement>("[data-vault-library-path]")]
      .find((candidate) => candidate.dataset.vaultLibraryPath === path);
    row?.focus();
  }

  function toggleFolder(path: string, force?: boolean) {
    setView("tree");
    const expanded = expandedFolderSet.has(path);
    const shouldExpand = force ?? !expanded;
    setExpandedFolders(shouldExpand
      ? [...new Set([...expandedFolders, path])]
      : expandedFolders.filter((candidate) => candidate !== path));
    setActiveDirectory(path);
  }

  function openContextMenu(target: ContextTarget, x: number, y: number) {
    onPreviewEnd?.();
    setContextMenu({ target, x, y });
    setActiveDirectory(contextDirectory(target));
  }

  function openContextMenuFromRow(target: ContextTarget, element: HTMLElement) {
    const bounds = element.getBoundingClientRect();
    openContextMenu(target, Math.min(bounds.right, window.innerWidth - 16), Math.min(bounds.top + 8, window.innerHeight - 16));
  }

  function openAction(nextAction: ActionState) {
    setAction(nextAction);
    setActionError(null);
    setMoveDestination(nextAction.type === "move" ? parentFolder(nextAction.target.path) : "");
    setActionValue(nextAction.type === "rename" ? targetInputName(nextAction.target, items) : "");
  }

  function createInDirectory(type: "create-note" | "create-folder", directory = activeDirectory) {
    openAction({ directory, type });
  }

  function contextActionTarget() {
    const target = contextMenu?.target;
    return target && target.kind !== "root" ? target : null;
  }

  async function submitAction(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action || isActing) return;

    const value = actionValue.trim();
    if ((action.type === "create-note" || action.type === "create-folder" || action.type === "rename") && !value) {
      setActionError("Введите название.");
      return;
    }
    if (action.type === "move" && moveDestination === parentFolder(action.target.path)) {
      setActionError("Выберите другую папку.");
      return;
    }

    setIsActing(true);
    setActionError(null);

    try {
      if (action.type === "create-note") await onCreateNote({ directory: action.directory, name: value });
      if (action.type === "create-folder") await onCreateFolder({ directory: action.directory, name: value });
      if (action.type === "rename") await onRename(action.target, value);
      if (action.type === "move") await onMove({ ...action.target, destination: moveDestination });
      if (action.type === "delete") await onDelete(action.target);

      setAction(null);
      setActionValue("");
      setInteractionMessage("Готово.");
    } catch (error) {
      setActionError(errorText(error));
    } finally {
      setIsActing(false);
    }
  }

  function siblingNodes(target: VaultLibraryTarget) {
    return directNodes(parentFolder(target.path));
  }

  function reorderedPaths(target: VaultLibraryTarget, destination: string, beforePath?: string) {
    const destinationNodes = directNodes(destination);
    const siblings = destinationNodes.map((node) => node.path).filter((path) => path !== target.path);
    const insertAt = beforePath ? Math.max(0, siblings.indexOf(beforePath)) : siblings.length;
    siblings.splice(insertAt, 0, target.path);

    const siblingSet = new Set(destinationNodes.map((node) => node.path));
    const next = orderedPaths.filter((path) => path !== target.path && !siblingSet.has(path));
    return [...next, ...siblings];
  }

  async function moveTarget(target: VaultLibraryTarget, destination: string, beforePath?: string) {
    if (target.kind === "folder" && (destination === target.path || destination.startsWith(`${target.path}/`))) {
      setInteractionMessage("Нельзя переместить папку внутрь самой себя.");
      return;
    }

    const sourceDirectory = parentFolder(target.path);
    const previousOrder = orderedPaths;
    setOrder(reorderedPaths(target, destination, beforePath));

    try {
      await onMove({ ...target, beforePath, destination });
      setInteractionMessage(sourceDirectory === destination ? "Порядок обновлён." : "Объект перемещён.");
    } catch (error) {
      setOrder(previousOrder);
      setInteractionMessage(errorText(error));
    }
  }

  function keyboardReorder(target: VaultLibraryTarget, direction: -1 | 1) {
    const siblings = siblingNodes(target);
    const index = siblings.findIndex((node) => node.path === target.path);
    const swapWith = siblings[index + direction];
    if (!swapWith) return;

    if (direction === -1) {
      void moveTarget(target, parentFolder(target.path), swapWith.path);
      return;
    }

    const nextAfterSwap = siblings[index + 2];
    void moveTarget(target, parentFolder(target.path), nextAfterSwap?.path);
  }

  function handleRowKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, node: LibraryNode) {
    const target = nodeTarget(node);
    const currentIndex = visiblePaths.indexOf(node.path);

    if (event.key === "Escape" && isSearchMode) {
      event.preventDefault();
      setQuery("");
      return;
    }

    if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      keyboardReorder(target, event.key === "ArrowUp" ? -1 : 1);
      return;
    }

    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const nextIndex = Math.min(visiblePaths.length - 1, Math.max(0, currentIndex + (event.key === "ArrowUp" ? -1 : 1)));
      focusRow(visiblePaths[nextIndex]);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      focusRow(event.key === "Home" ? visiblePaths[0] : visiblePaths.at(-1));
      return;
    }
    if (event.key === "ArrowRight" && node.kind === "folder") {
      event.preventDefault();
      if (!expandedFolderSet.has(node.path)) toggleFolder(node.path, true);
      else focusRow(visiblePaths[currentIndex + 1]);
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      if (node.kind === "folder" && expandedFolderSet.has(node.path)) toggleFolder(node.path, false);
      else focusRow(parentFolder(node.path));
      return;
    }
    if (event.key === "F2") {
      event.preventDefault();
      openAction({ target, type: "rename" });
      return;
    }
    if (event.key === "Delete") {
      event.preventDefault();
      openAction({ target, type: "delete" });
      return;
    }
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      event.preventDefault();
      openContextMenuFromRow(target, event.currentTarget);
    }
  }

  function dropPosition(
    event: React.DragEvent<HTMLElement>,
    node: LibraryNode,
    horizontal = false,
  ): DropState["position"] {
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = horizontal
      ? (event.clientX - bounds.left) / Math.max(bounds.width, 1)
      : (event.clientY - bounds.top) / Math.max(bounds.height, 1);
    if (node.kind === "folder" && ratio >= 0.28 && ratio <= 0.72) return "inside";
    return ratio < 0.5 ? "before" : "after";
  }

  function handleDragOver(event: React.DragEvent<HTMLElement>, node: LibraryNode, horizontal = false) {
    if (!draggedTarget || draggedTarget.path === node.path) return;
    const position = dropPosition(event, node, horizontal);
    const destination = position === "inside" ? node.path : parentFolder(node.path);
    if (draggedTarget.kind === "folder" && (destination === draggedTarget.path || destination.startsWith(`${draggedTarget.path}/`))) return;

    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    setDropState({ path: node.path, position });
  }

  function handleDrop(event: React.DragEvent<HTMLElement>, node: LibraryNode, horizontal = false) {
    if (!draggedTarget) return;
    event.preventDefault();
    event.stopPropagation();

    const position = dropPosition(event, node, horizontal);
    if (position === "inside") {
      toggleFolder(node.path, true);
      void moveTarget(draggedTarget, node.path);
    } else {
      const siblings = directNodes(parentFolder(node.path)).filter((candidate) => candidate.path !== draggedTarget.path);
      const targetIndex = siblings.findIndex((candidate) => candidate.path === node.path);
      const beforePath = position === "before" ? node.path : siblings[targetIndex + 1]?.path;
      void moveTarget(draggedTarget, parentFolder(node.path), beforePath);
    }

    setDraggedTarget(null);
    setDropState(null);
  }

  function handleRootDrop(event: React.DragEvent<HTMLElement>) {
    if (!draggedTarget) return;
    event.preventDefault();
    void moveTarget(draggedTarget, "");
    setDraggedTarget(null);
    setDropState(null);
  }

  function startDragging(event: React.DragEvent<HTMLButtonElement>, node: LibraryNode) {
    const target = nodeTarget(node);
    setDraggedTarget(target);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", node.path);
    event.dataTransfer.setData("application/x-archeion-vault-path", JSON.stringify(target));
  }

  function activateNode(node: LibraryNode) {
    setActiveDirectory(node.kind === "folder" ? node.path : parentFolder(node.path));
    if (node.kind === "folder") {
      toggleFolder(node.path);
      return;
    }
    onPreviewEnd?.();
    void onOpenItem(node.item);
  }

  function renderNode(
    node: LibraryNode,
    depth: number,
    options?: { showLocation?: boolean; compact?: boolean; horizontal?: boolean },
  ) {
    const target = nodeTarget(node);
    const compact = options?.compact ?? false;
    const horizontal = options?.horizontal ?? false;
    const showLocation = options?.showLocation ?? false;
    const isExpanded = node.kind === "folder" && expandedFolderSet.has(node.path);
    const isSelected = node.kind === "file" && selectedPath === node.path;
    const isOpen = node.kind === "file" && openPathSet.has(node.path);
    const isBusy = targetIsBusy(target, busyPathSet);
    const folderItemCount = node.kind === "folder" ? folderFileCountByPath.get(node.path) ?? 0 : 0;
    const drop = dropState?.path === node.path ? dropState.position : null;

    return (
      <button
        aria-busy={isBusy || undefined}
        aria-expanded={node.kind === "folder" ? isExpanded : undefined}
        aria-label={compact
          ? `${node.kind === "folder" ? "Папка" : "Файл"}: ${node.name}${isOpen ? ", открыт" : ""}`
          : undefined}
        aria-level={view === "tree" && !isSearchMode ? depth + 1 : undefined}
        aria-selected={isSelected}
        className={cn(
          "group/node relative flex min-h-9 w-full items-center rounded-md text-left outline-none transition-[background-color,color,box-shadow,transform] duration-150 motion-reduce:transition-none",
          compact ? "justify-center px-0" : "gap-2 pr-2",
          horizontal && "w-9 shrink-0",
          "hover:bg-accent/70 hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70",
          isSelected && "bg-accent text-accent-foreground",
          isBusy && "cursor-wait opacity-65",
          draggedTarget?.path === node.path && "opacity-40",
          drop === "inside" && "bg-accent ring-1 ring-inset ring-primary/55",
          drop === "before" && (horizontal
            ? "before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-full before:bg-primary"
            : "before:absolute before:inset-x-1 before:top-0 before:h-0.5 before:rounded-full before:bg-primary"),
          drop === "after" && (horizontal
            ? "after:absolute after:inset-y-1 after:right-0 after:w-0.5 after:rounded-full after:bg-primary"
            : "after:absolute after:inset-x-1 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary"),
        )}
        data-vault-library-path={node.path}
        disabled={isBusy}
        draggable={!isBusy}
        onClick={() => activateNode(node)}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          openContextMenu(target, event.clientX, event.clientY);
        }}
        onDragEnd={() => {
          setDraggedTarget(null);
          setDropState(null);
        }}
        onDragOver={(event) => handleDragOver(event, node, horizontal)}
        onDragStart={(event) => startDragging(event, node)}
        onDrop={(event) => handleDrop(event, node, horizontal)}
        onBlur={node.kind === "file" && node.item.kind === "note" ? onPreviewEnd : undefined}
        onFocus={(event) => {
          setFocusedPath(node.path);
          setActiveDirectory(node.kind === "folder" ? node.path : parentFolder(node.path));
          if (node.kind === "file" && node.item.kind === "note") onPreviewItem?.(node.item, event.currentTarget);
        }}
        onKeyDown={(event) => handleRowKeyDown(event, node)}
        onPointerEnter={node.kind === "file" && node.item.kind === "note"
          ? (event) => onPreviewItem?.(node.item, event.currentTarget)
          : undefined}
        onPointerLeave={node.kind === "file" && node.item.kind === "note" ? onPreviewEnd : undefined}
        role={isSearchMode || view === "all" ? "option" : "treeitem"}
        style={compact ? undefined : { paddingInlineStart: `${6 + depth * 14}px` }}
        tabIndex={node.path === tabStopPath ? 0 : -1}
        title={compact ? `${node.name} - ПКМ для действий` : node.path}
        type="button"
      >
        {node.kind === "folder" && !compact ? (
          <ChevronRightIcon
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none",
              isExpanded && "rotate-90 text-foreground",
            )}
          />
        ) : !compact ? <span aria-hidden="true" className="size-3.5 shrink-0" /> : null}

        <span className={cn(
          "grid size-7 shrink-0 place-items-center",
          !compact && "rounded-[5px]",
          node.kind === "folder"
            ? isExpanded ? (compact ? "text-primary" : "bg-primary/10 text-primary") : "text-muted-foreground"
            : node.item.kind === "note" ? "text-primary" : "text-muted-foreground",
        )}>
          {isBusy ? <LoadingIcon className="size-4" motion="loop" /> : node.kind === "folder" ? (
            isExpanded ? <FolderOpenIcon className="size-4" /> : <FolderIcon className="size-4" />
          ) : node.item.kind === "note" ? (
            <BookIcon className="size-4" />
          ) : (
            <AttachmentIcon className="size-4" />
          )}
        </span>

        {!compact ? (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium text-foreground">{node.name}</span>
              {showLocation ? (
                <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                  {parentFolder(node.path) || "Корень Vault"}
                </span>
              ) : null}
            </span>
            {node.kind === "folder" ? (
              <span className="text-[10px] tabular-nums text-muted-foreground" title={`${folderItemCount} файлов внутри`}>
                {folderItemCount}
              </span>
            ) : isOpen ? (
              <span className="h-4 w-0.5 shrink-0 rounded-full bg-primary" title="Открыт во вкладке">
                <span className="sr-only">Открыт во вкладке</span>
              </span>
            ) : null}
          </>
        ) : isOpen ? (
          <span aria-hidden="true" className="absolute right-0.5 h-3 w-0.5 rounded-full bg-primary" />
        ) : null}
      </button>
    );
  }

  function renderTree(directory: string, depth: number, compact = false): React.ReactNode {
    const nodes = directNodes(directory);
    if (nodes.length === 0 && directory) {
      return compact ? null : (
        <li className="px-2 py-2 text-[11px] text-muted-foreground" role="none">Папка пуста</li>
      );
    }

    return nodes.map((node) => (
      <li key={node.path} role="none">
        {renderNode(node, depth, { compact })}
        {node.kind === "folder" && expandedFolderSet.has(node.path) ? (
          <ul aria-label={`Содержимое папки ${node.name}`} className="mt-1 grid gap-1" role="group">
            {renderTree(node.path, depth + 1, compact)}
          </ul>
        ) : null}
      </li>
    ));
  }

  function renderSearchResults(compact = false) {
    if (isSearching && searchResults.length === 0) {
      return (
        <div aria-busy="true" className={cn("space-y-1", compact ? "px-1" : "px-0")}>
          {[0, 1, 2].map((index) => (
            <div className={cn("animate-pulse rounded-md bg-muted", compact ? "mx-auto size-8" : "h-12 w-full")} key={index} />
          ))}
        </div>
      );
    }

    if (!isSearching && searchResults.length === 0) {
      return compact ? (
        <SearchIcon className="mx-auto mt-3 size-4 text-muted-foreground" motion="none" />
      ) : (
        <div className="px-2 py-8 text-center">
          <SearchIcon className="mx-auto size-4 text-muted-foreground" motion="none" />
          <p className="mt-2 text-xs font-medium">Ничего не найдено</p>
          <p className="mt-1 text-[11px] leading-5 text-muted-foreground">Поиск проверяет названия, пути и текст заметок.</p>
        </div>
      );
    }

    return (
      <ul aria-label="Результаты поиска" className="grid gap-1" role="listbox">
        {searchResults.map((result) => {
          const node: LibraryNode = {
            item: result.item,
            kind: "file",
            name: displayItemName(result.item),
            path: result.item.path,
          };

          if (compact) return <li key={resultKey(result)} role="none">{renderNode(node, 0, { compact: true })}</li>;

          return (
            <li key={resultKey(result)} role="none">
              <button
                aria-selected={selectedPath === result.item.path}
                className={cn(
                  "group/result flex min-h-14 w-full gap-2 rounded-md px-2 py-2 text-left outline-none transition-colors duration-150 hover:bg-accent/70 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70 motion-reduce:transition-none",
                  selectedPath === result.item.path && "bg-accent",
                )}
                data-vault-library-path={result.item.path}
                onClick={() => {
                  onPreviewEnd?.();
                  void onOpenItem(result.item);
                }}
                onBlur={result.item.kind === "note" ? onPreviewEnd : undefined}
                onContextMenu={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  openContextMenu({ kind: "file", path: result.item.path }, event.clientX, event.clientY);
                }}
                onKeyDown={(event) => handleRowKeyDown(event, node)}
                onFocus={result.item.kind === "note"
                  ? (event) => {
                      setFocusedPath(result.item.path);
                      setActiveDirectory(parentFolder(result.item.path));
                      onPreviewItem?.(result.item, event.currentTarget);
                    }
                  : () => {
                      setFocusedPath(result.item.path);
                      setActiveDirectory(parentFolder(result.item.path));
                    }}
                onPointerEnter={result.item.kind === "note"
                  ? (event) => onPreviewItem?.(result.item, event.currentTarget)
                  : undefined}
                onPointerLeave={result.item.kind === "note" ? onPreviewEnd : undefined}
                role="option"
                tabIndex={result.item.path === tabStopPath ? 0 : -1}
                type="button"
              >
                <span className={cn(
                  "mt-0.5 grid size-7 shrink-0 place-items-center rounded-[5px]",
                  result.item.kind === "note" ? "text-primary" : "text-muted-foreground",
                )}>
                  {result.item.kind === "note"
                    ? <BookIcon className="size-4" />
                    : <AttachmentIcon className="size-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-xs font-medium">
                      {highlightText(displayItemName(result.item), trimmedQuery)}
                    </span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">{searchMatchLabel(result.match)}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                    {result.snippet ? highlightText(result.snippet, trimmedQuery) : result.item.path}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  function renderEmptyState() {
    return (
      <div className="px-3 py-9 text-center">
        <FolderOpenIcon className="mx-auto size-5 text-muted-foreground" motion="none" />
        <p className="mt-3 text-xs font-medium">Vault пока пуст</p>
        <p className="mt-1 text-[11px] leading-5 text-muted-foreground">Создайте заметку, папку или добавьте файл.</p>
        <Button className="mt-4 h-8 rounded-md px-2.5 text-xs shadow-none" onClick={() => createInDirectory("create-note", "")} size="sm" type="button">
          <FileDocumentPlusIcon className="size-3.5" motion="hover" />
          Новая заметка
        </Button>
      </div>
    );
  }

  const actionTarget = action && "target" in action ? action.target : null;
  const actionTitle = action?.type === "create-note"
    ? "Новая заметка"
    : action?.type === "create-folder"
      ? "Новая папка"
      : action?.type === "rename"
        ? "Переименовать"
        : action?.type === "move"
          ? "Переместить"
          : "Удалить";
  const actionDescription = action?.type === "delete" && actionTarget
    ? `Объект «${targetLabel(actionTarget, items)}» будет удалён из Vault. Это действие нельзя отменить в приложении.`
    : action?.type === "move" && actionTarget
      ? `Выберите новую папку для объекта «${targetLabel(actionTarget, items)}».`
      : action?.type === "create-note" || action?.type === "create-folder"
        ? `Место: ${action.directory || "Корень Vault"}`
        : actionTarget
          ? `Текущее название: ${targetLabel(actionTarget, items)}`
          : "";

  const contextTarget = contextActionTarget();
  const contextTargetBusy = contextTarget ? targetIsBusy(contextTarget, busyPathSet) : false;
  const contextTargetDirectory = contextMenu ? contextDirectory(contextMenu.target) : activeDirectory;
  const compactExpandIcon = edge === "right"
    ? <ChevronLeftIcon className="size-4" motion="hover" />
    : <ChevronRightIcon className="size-4" motion="hover" />;
  const expandedCollapseIcon = edge === "right"
    ? <ChevronRightIcon className="size-4" motion="hover" />
    : <ChevronLeftIcon className="size-4" motion="hover" />;

  const sharedOverlays = (
    <>
      <DropdownMenu
        modal={false}
        onOpenChange={(open) => {
          if (open) return;
          const path = contextMenu?.target.path;
          setContextMenu(null);
          if (path) window.requestAnimationFrame(() => focusRow(path));
        }}
        open={contextMenu !== null}
      >
        <DropdownMenuTrigger asChild>
          <span
            aria-hidden="true"
            className="pointer-events-none fixed size-px opacity-0"
            style={{ left: contextMenu?.x ?? 0, top: contextMenu?.y ?? 0 }}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52 rounded-lg" side="right" sideOffset={2}>
          <DropdownMenuLabel className="truncate">
            {contextMenu?.target.kind === "root"
              ? "Корень Vault"
              : contextMenu?.target
                ? targetLabel(contextMenu.target, items)
                : "Действия"}
          </DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => createInDirectory("create-note", contextTargetDirectory)}>
            <FileDocumentPlusIcon className="size-4" />
            Новая заметка
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => createInDirectory("create-folder", contextTargetDirectory)}>
            <FolderPlusIcon className="size-4" />
            Новая папка
          </DropdownMenuItem>
          {onImport ? (
            <DropdownMenuItem onSelect={() => onImport(contextTargetDirectory)}>
              <UploadIcon className="size-4" />
              Добавить файл
            </DropdownMenuItem>
          ) : null}
          {contextTarget ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={contextTargetBusy} onSelect={() => openAction({ target: contextTarget, type: "rename" })}>
                <EditIcon className="size-4" />
                Переименовать
                <span className="ml-auto text-[10px] text-muted-foreground">F2</span>
              </DropdownMenuItem>
              <DropdownMenuItem disabled={contextTargetBusy} onSelect={() => openAction({ target: contextTarget, type: "move" })}>
                <FolderOpenIcon className="size-4" />
                Переместить
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                disabled={contextTargetBusy}
                onSelect={() => openAction({ target: contextTarget, type: "delete" })}
              >
                <TrashIcon className="size-4" />
                Удалить
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        onOpenChange={(open) => {
          if (!open && !isActing) {
            setAction(null);
            setActionError(null);
          }
        }}
        open={action !== null}
      >
        <DialogContent className="gap-5 rounded-xl p-5 [&>button:last-child]:grid [&>button:last-child]:size-8 [&>button:last-child]:place-items-center [&>button:last-child]:p-0">
          <DialogHeader>
            <DialogTitle>{actionTitle}</DialogTitle>
            <DialogDescription>{actionDescription}</DialogDescription>
          </DialogHeader>

          <form className="grid gap-4" onSubmit={submitAction}>
            {action?.type === "create-note" || action?.type === "create-folder" || action?.type === "rename" ? (
              <div className="grid gap-2">
                <label className="text-sm font-medium" htmlFor={actionInputId}>
                  {action.type === "create-folder" ? "Название папки" : action.type === "create-note" ? "Название заметки" : "Новое название"}
                </label>
                <Input
                  autoFocus
                  disabled={isActing}
                  id={actionInputId}
                  onChange={(event) => setActionValue(event.target.value)}
                  placeholder={action.type === "create-folder" ? "Например, Исследования" : "Например, Новая идея"}
                  value={actionValue}
                />
              </div>
            ) : null}

            {action?.type === "move" && actionTarget ? (
              <div className="grid gap-2">
                <label className="text-sm font-medium" htmlFor={moveSelectId}>Новая папка</label>
                <select
                  autoFocus
                  className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                  disabled={isActing}
                  id={moveSelectId}
                  onChange={(event) => setMoveDestination(event.target.value)}
                  value={moveDestination}
                >
                  <option value="">Корень Vault</option>
                  {folderPaths
                    .filter((folder) => actionTarget.kind !== "folder" || (folder !== actionTarget.path && !folder.startsWith(`${actionTarget.path}/`)))
                    .map((folder) => <option key={folder} value={folder}>{folder}</option>)}
                </select>
              </div>
            ) : null}

            {actionError ? <p className="text-sm text-destructive" role="alert">{actionError}</p> : null}

            <DialogFooter>
              <Button disabled={isActing} onClick={() => setAction(null)} type="button" variant="ghost">Отмена</Button>
              <Button
                className={cn(action?.type === "delete" && "bg-destructive text-white hover:bg-destructive/90")}
                disabled={isActing}
                type="submit"
              >
                {isActing ? <LoadingIcon className="size-4" motion="loop" /> : action?.type === "delete" ? <TrashIcon className="size-4" /> : null}
                {isActing ? "Подождите…" : action?.type === "delete" ? "Удалить" : "Готово"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );

  if (presentation === "hidden") {
    return (
      <>
        <button
          aria-label="Показать панель Vault"
          className={cn(
            "vault-panel-reveal group relative grid h-16 w-10 place-items-center border bg-sidebar text-sidebar-foreground outline-none transition-[background-color,color] duration-150 hover:bg-accent hover:text-accent-foreground active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring/70 motion-reduce:transition-none",
            edge === "left" ? "rounded-l-none rounded-r-xl border-l-0" : "rounded-l-xl rounded-r-none border-r-0",
            className,
          )}
          data-edge={edge}
          data-orientation={orientation}
          onClick={() => onPresentationChange("expanded")}
          title="Показать панель Vault"
          type="button"
        >
          {compactExpandIcon}
        </button>
        {sharedOverlays}
      </>
    );
  }

  if (presentation === "compact" && orientation === "horizontal") {
    return (
      <section
        aria-label="Компактная панель Vault"
        className={cn("flex h-full min-h-14 w-full min-w-0 items-center bg-sidebar/70 text-sidebar-foreground", className)}
      >
        <header className="flex h-full shrink-0 items-center gap-1 border-r px-2">
          <button
            aria-label="Расширить панель Vault"
            className="grid size-9 place-items-center rounded-md bg-primary text-primary-foreground outline-none transition-transform duration-150 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring/70 motion-reduce:transition-none"
            onClick={() => onPresentationChange("expanded")}
            title="Расширить панель Vault"
            type="button"
          >
            <ArcheionMark className="size-4" />
          </button>
          <button
            aria-label="Скрыть панель Vault"
            className="grid size-8 place-items-center rounded-md text-muted-foreground outline-none transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70"
            onClick={() => onPresentationChange("hidden")}
            title="Скрыть панель Vault"
            type="button"
          >
            <CloseIcon className="size-3.5" motion="hover" />
          </button>
        </header>

        <div aria-label="Быстрые действия" className="flex h-full shrink-0 items-center gap-0.5 border-r px-1.5" role="toolbar">
          <button
            aria-label="Поиск по Vault"
            className="grid size-8 place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70"
            onClick={() => {
              onPresentationChange("expanded");
              window.requestAnimationFrame(() => searchInputRef.current?.focus());
            }}
            title="Поиск по Vault (⌘/Ctrl K)"
            type="button"
          >
            <SearchIcon className="size-4" motion="hover" />
          </button>
          <button
            aria-label="Создать заметку"
            className="grid size-8 place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70"
            onClick={() => createInDirectory("create-note")}
            title={`Создать заметку: ${activeDirectory || "Корень Vault"}`}
            type="button"
          >
            <FileDocumentPlusIcon className="size-4" motion="hover" />
          </button>
          <button
            aria-label="Создать папку"
            className="grid size-8 place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70"
            onClick={() => createInDirectory("create-folder")}
            title={`Создать папку: ${activeDirectory || "Корень Vault"}`}
            type="button"
          >
            <FolderPlusIcon className="size-4" motion="hover" />
          </button>
          {onImport ? (
            <button
              aria-label="Добавить файл"
              className="grid size-8 place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70"
              onClick={() => onImport(activeDirectory)}
              title={`Добавить файл: ${activeDirectory || "Корень Vault"}`}
              type="button"
            >
              <UploadIcon className="size-4" motion="hover" />
            </button>
          ) : null}
        </div>

        <div
          aria-busy={isLoading}
          className="min-w-0 flex-1 overflow-x-auto px-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          onContextMenu={(event) => {
            if ((event.target as HTMLElement).closest("[data-vault-library-path]")) return;
            event.preventDefault();
            openContextMenu(ROOT_TARGET, event.clientX, event.clientY);
          }}
          onDragOver={(event) => {
            if (!draggedTarget || (event.target as HTMLElement).closest("[data-vault-library-path]")) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
          }}
          onDrop={handleRootDrop}
        >
          {isLoading ? (
            <div className="flex items-center gap-1 py-1">
              {[0, 1, 2, 3].map((index) => <div className="size-8 shrink-0 animate-pulse rounded-md bg-muted" key={index} />)}
            </div>
          ) : isSearchMode ? (
            <ul aria-label="Результаты поиска" className="flex items-center gap-1 py-1" role="listbox">
              {searchResults.map((result) => {
                const node: LibraryNode = {
                  item: result.item,
                  kind: "file",
                  name: displayItemName(result.item),
                  path: result.item.path,
                };
                return <li key={resultKey(result)} role="none">{renderNode(node, 0, { compact: true, horizontal: true })}</li>;
              })}
            </ul>
          ) : view === "tree" ? (
            <ul aria-label="Дерево папок и файлов" className="flex items-center gap-1 py-1" role="tree">
              {visibleTreeNodes.map(({ depth, node }) => (
                <li key={node.path} role="none">{renderNode(node, depth, { compact: true, horizontal: true })}</li>
              ))}
            </ul>
          ) : (
            <ul aria-label="Все файлы Vault" className="flex items-center gap-1 py-1" role="listbox">
              {allFileNodes.map((node) => (
                <li key={node.path} role="none">{renderNode(node, 0, { compact: true, horizontal: true })}</li>
              ))}
            </ul>
          )}
        </div>

        <footer className="flex h-full shrink-0 items-center gap-0.5 border-l px-1.5">
          <button
            aria-label={view === "tree" ? "Показать все файлы" : "Показать дерево папок"}
            className="grid size-8 place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70"
            onClick={() => setView(view === "tree" ? "all" : "tree")}
            title={view === "tree" ? "Все файлы" : "Папки"}
            type="button"
          >
            {view === "tree" ? <CollectionIcon className="size-4" /> : <FolderIcon className="size-4" />}
          </button>
          {settings ? <div className="max-h-12 max-w-48 overflow-auto">{settings}</div> : null}
          <button
            aria-label="Расширить панель Vault"
            className="grid size-8 place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70"
            onClick={() => onPresentationChange("expanded")}
            title="Расширить панель Vault"
            type="button"
          >
            {compactExpandIcon}
          </button>
        </footer>
        <span aria-live="polite" className="sr-only">{interactionMessage}</span>
        {sharedOverlays}
      </section>
    );
  }

  if (presentation === "compact") {
    return (
      <section
        aria-label="Компактная панель Vault"
        className={cn("flex h-full min-h-0 w-full min-w-12 flex-col bg-sidebar/70 text-sidebar-foreground", className)}
      >
        <header className="flex shrink-0 flex-col items-center gap-1 border-b px-1 py-2">
          <button
            aria-label="Расширить панель Vault"
            className="grid size-9 place-items-center rounded-md bg-primary text-primary-foreground outline-none transition-transform duration-150 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring/70 motion-reduce:transition-none"
            onClick={() => onPresentationChange("expanded")}
            title="Расширить панель Vault"
            type="button"
          >
            {compactExpandIcon}
          </button>
          <button
            aria-label="Скрыть панель Vault"
            className="grid size-8 place-items-center rounded-md text-muted-foreground outline-none transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70 motion-reduce:transition-none"
            onClick={() => onPresentationChange("hidden")}
            title="Скрыть панель Vault"
            type="button"
          >
            <CloseIcon className="size-3.5" motion="hover" />
          </button>
        </header>

        <div aria-label="Быстрые действия" className="grid shrink-0 justify-items-center gap-0.5 border-b py-1" role="toolbar">
          <button
            aria-label="Поиск по Vault"
            className="grid size-8 place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70"
            onClick={() => {
              onPresentationChange("expanded");
              window.requestAnimationFrame(() => searchInputRef.current?.focus());
            }}
            title="Поиск по Vault (⌘/Ctrl K)"
            type="button"
          >
            <SearchIcon className="size-4" motion="hover" />
          </button>
          <button
            aria-label="Создать заметку"
            className="grid size-8 place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70"
            onClick={() => createInDirectory("create-note")}
            title={`Создать заметку: ${activeDirectory || "Корень Vault"}`}
            type="button"
          >
            <FileDocumentPlusIcon className="size-4" motion="hover" />
          </button>
          <button
            aria-label="Создать папку"
            className="grid size-8 place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70"
            onClick={() => createInDirectory("create-folder")}
            title={`Создать папку: ${activeDirectory || "Корень Vault"}`}
            type="button"
          >
            <FolderPlusIcon className="size-4" motion="hover" />
          </button>
          {onImport ? (
            <button
              aria-label="Добавить файл"
              className="grid size-8 place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70"
              onClick={() => onImport(activeDirectory)}
              title={`Добавить файл: ${activeDirectory || "Корень Vault"}`}
              type="button"
            >
              <UploadIcon className="size-4" motion="hover" />
            </button>
          ) : null}
        </div>

        <div
          aria-busy={isLoading}
          className="auto-hide-scrollbar min-h-0 flex-1 overflow-y-auto px-1 py-1"
          onScroll={(event) => revealScrollbar(event.currentTarget)}
        >
          {isLoading ? (
            <div className="grid gap-1">
              {[0, 1, 2, 3].map((index) => <div className="mx-auto size-8 animate-pulse rounded-md bg-muted" key={index} />)}
            </div>
          ) : isSearchMode ? renderSearchResults(true) : view === "tree" ? (
            <ul aria-label="Дерево папок и файлов" className="grid gap-1" role="tree">{renderTree("", 0, true)}</ul>
          ) : (
            <ul aria-label="Все файлы Vault" className="grid gap-1" role="listbox">
              {allFileNodes.map((node) => <li key={node.path} role="none">{renderNode(node, 0, { compact: true })}</li>)}
            </ul>
          )}
        </div>

        <footer className="grid shrink-0 justify-items-center gap-0.5 border-t px-1 py-1">
          <button
            aria-label={view === "tree" ? "Показать все файлы" : "Показать дерево папок"}
            className="grid size-8 place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70"
            onClick={() => setView(view === "tree" ? "all" : "tree")}
            title={view === "tree" ? "Все файлы" : "Папки"}
            type="button"
          >
            {view === "tree" ? <CollectionIcon className="size-4" /> : <FolderIcon className="size-4" />}
          </button>
          {settings ? <div className="flex max-h-24 w-full justify-center overflow-auto">{settings}</div> : null}
        </footer>
        <span aria-live="polite" className="sr-only">{interactionMessage}</span>
        {sharedOverlays}
      </section>
    );
  }

  return (
    <section
      aria-label="Панель Vault"
      className={cn("flex h-full min-h-0 min-w-0 flex-col bg-sidebar text-sidebar-foreground", className)}
      onContextMenu={(event) => {
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        openContextMenu(ROOT_TARGET, event.clientX, event.clientY);
      }}
    >
      <header className="shrink-0 border-b bg-sidebar px-3 py-2.5">
        <div className="flex min-h-9 min-w-0 items-center gap-2">
          <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground">
            <ArcheionMark className="size-4" />
          </span>
          <h1 className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-[-0.025em]">{title}</h1>
          {settings ? (
            <div className="flex shrink-0 items-center">
              {settings}
            </div>
          ) : null}
          <button
            aria-label="Уменьшить панель Vault"
            className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground outline-none transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70 motion-reduce:transition-none"
            onClick={() => onPresentationChange("compact")}
            title="Компактная панель"
            type="button"
          >
            {expandedCollapseIcon}
          </button>
          <button
            aria-label="Скрыть панель Vault"
            className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground outline-none transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70 motion-reduce:transition-none"
            onClick={() => onPresentationChange("hidden")}
            title="Скрыть панель"
            type="button"
          >
            <CloseIcon className="size-3.5" motion="hover" />
          </button>
        </div>
      </header>

      <div className="h-[6.625rem] shrink-0 border-b bg-sidebar px-3 py-[15px]">
        <div className="relative">
          <label className="sr-only" htmlFor={searchInputId}>Поиск по Vault</label>
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" motion="none" />
          <Input
            aria-describedby={`${searchInputId}-hint`}
            className="h-9 rounded-md bg-background pl-8 pr-16 text-sm shadow-none"
            id={searchInputId}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && query) {
                event.preventDefault();
                setQuery("");
              }
              if (event.key === "ArrowDown") {
                event.preventDefault();
                focusRow(visiblePaths[0]);
              }
            }}
            placeholder="Поиск в файлах"
            ref={searchInputRef}
            spellCheck={false}
            type="search"
            value={query}
          />
          {query ? (
            <button
              aria-label="Очистить поиск"
              className="absolute right-0.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-[5px] text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70"
              onClick={() => {
                setQuery("");
                searchInputRef.current?.focus();
              }}
              title="Очистить поиск"
              type="button"
            >
              <CloseIcon className="size-3.5" motion="hover" />
            </button>
          ) : (
            <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-[4px] border bg-muted/70 px-1.5 py-0.5 text-[10px] text-muted-foreground">⌘K</kbd>
          )}
          <span className="sr-only" id={`${searchInputId}-hint`}>Ищет по названию, пути и содержимому Markdown-файлов.</span>
        </div>

        <div aria-label="Создание и импорт" className="mt-2 grid grid-cols-3 gap-1" role="toolbar">
          <button
            className="flex min-h-8 items-center justify-center gap-1.5 rounded-md border border-transparent bg-muted/35 px-1.5 text-xs font-medium text-muted-foreground outline-none transition-[background-color,border-color,color,transform] duration-150 hover:border-border hover:bg-accent hover:text-foreground active:translate-y-px focus-visible:ring-2 focus-visible:ring-ring/70 motion-reduce:transition-none"
            onClick={() => createInDirectory("create-note")}
            title={`Создать заметку: ${activeDirectory || "Корень Vault"}`}
            type="button"
          >
            <FileDocumentPlusIcon className="size-3.5" motion="hover" />
            <span className="truncate">Новая</span>
          </button>
          <button
            className="flex min-h-8 items-center justify-center gap-1.5 rounded-md border border-transparent bg-muted/35 px-1.5 text-xs font-medium text-muted-foreground outline-none transition-[background-color,border-color,color,transform] duration-150 hover:border-border hover:bg-accent hover:text-foreground active:translate-y-px focus-visible:ring-2 focus-visible:ring-ring/70 motion-reduce:transition-none"
            onClick={() => createInDirectory("create-folder")}
            title={`Создать папку: ${activeDirectory || "Корень Vault"}`}
            type="button"
          >
            <FolderPlusIcon className="size-3.5" motion="hover" />
            <span className="truncate">Папка</span>
          </button>
          <button
            className="flex min-h-8 items-center justify-center gap-1.5 rounded-md border border-transparent bg-muted/35 px-1.5 text-xs font-medium text-muted-foreground outline-none transition-[background-color,border-color,color,transform] duration-150 hover:border-border hover:bg-accent hover:text-foreground active:translate-y-px focus-visible:ring-2 focus-visible:ring-ring/70 disabled:pointer-events-none disabled:opacity-40 motion-reduce:transition-none"
            disabled={!onImport}
            onClick={() => onImport?.(activeDirectory)}
            title={`Добавить файл: ${activeDirectory || "Корень Vault"}`}
            type="button"
          >
            <UploadIcon className="size-3.5" motion="hover" />
            <span className="truncate">Файл</span>
          </button>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 px-3 pb-2 pt-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[13px] font-semibold tracking-[-0.015em]">Файлы</h2>
          <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
            {isSearchMode ? `${searchResults.length} найдено` : `${items.length} файлов, ${folderPaths.length} папок`}
          </p>
        </div>
        <button
          aria-label="Действия в корне Vault"
          className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground outline-none transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70 motion-reduce:transition-none"
          onClick={(event) => openContextMenuFromRow(ROOT_TARGET, event.currentTarget)}
          title="Действия в корне Vault"
          type="button"
        >
          <HomeIcon className="size-4" />
        </button>
      </div>

      {!isSearchMode ? (
        <div aria-label="Представление файлов" className="mx-3 flex shrink-0 rounded-md bg-muted p-0.5" role="tablist">
          <button
            aria-selected={view === "tree"}
            className={cn(
              "flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[5px] px-2 text-xs font-medium text-muted-foreground outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring/70 motion-reduce:transition-none",
              view === "tree" && "bg-background text-foreground shadow-sm",
            )}
            onClick={() => setView("tree")}
            role="tab"
            type="button"
          >
            <FolderIcon className="size-3.5" />
            <span>Папки</span>
          </button>
          <button
            aria-selected={view === "all"}
            className={cn(
              "flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[5px] px-2 text-xs font-medium text-muted-foreground outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring/70 motion-reduce:transition-none",
              view === "all" && "bg-background text-foreground shadow-sm",
            )}
            onClick={() => setView("all")}
            role="tab"
            type="button"
          >
            <CollectionIcon className="size-3.5" />
            <span>Все файлы</span>
          </button>
        </div>
      ) : null}

      <div
        aria-busy={isLoading || isSearching}
        className="auto-hide-scrollbar min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-2"
        onContextMenu={(event) => {
          if ((event.target as HTMLElement).closest("[data-vault-library-path]")) return;
          event.preventDefault();
          openContextMenu(ROOT_TARGET, event.clientX, event.clientY);
        }}
        onDragOver={(event) => {
          if (!draggedTarget || (event.target as HTMLElement).closest("[data-vault-library-path]")) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }}
        onDrop={handleRootDrop}
        onScroll={(event) => revealScrollbar(event.currentTarget)}
      >
        {isLoading ? (
          <div className="grid gap-1" aria-label="Загрузка файлов">
            {[0, 1, 2, 3].map((index) => <div className="h-9 animate-pulse rounded-md bg-muted" key={index} />)}
          </div>
        ) : isSearchMode ? (
          renderSearchResults()
        ) : items.length === 0 && folderPaths.length === 0 ? (
          renderEmptyState()
        ) : view === "tree" ? (
          <ul aria-label="Дерево папок и файлов" className="grid gap-1" role="tree">{renderTree("", 0)}</ul>
        ) : (
          <ul aria-label="Все файлы Vault" className="grid gap-1" role="listbox">
            {allFileNodes.map((node) => (
              <li key={node.path} role="none">{renderNode(node, 0, { showLocation: true })}</li>
            ))}
          </ul>
        )}
      </div>

      {errorMessage || searchError ? (
        <p className="shrink-0 border-t px-3 py-2 text-xs leading-5 text-destructive" role="alert">{searchError ?? errorMessage}</p>
      ) : (
        <footer className="flex min-h-9 shrink-0 items-center gap-2 border-t px-3 text-[10px] text-muted-foreground">
          <span className="truncate">ПКМ или Shift F10 для действий</span>
          <span className="ml-auto shrink-0">Alt ↑↓ меняет порядок</span>
        </footer>
      )}

      <span aria-live="polite" className="sr-only">{interactionMessage}</span>
      {sharedOverlays}
    </section>
  );
}

export { VaultLibrary };
