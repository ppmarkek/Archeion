"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { Button } from "@/components/ui/button";
import { NotificationViewport } from "@/components/notifications/notification-viewport";
import { useNotifications } from "@/components/notifications/notification-provider";
import { SettingsDialog } from "@/components/settings/settings-dialog";
import { useAppSettings } from "@/components/settings/settings-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { BrainGraph } from "@/components/vault/brain-graph";
import {
  createHttpVaultAdapter,
  type VaultFolder,
  type VaultMutation,
  VaultOperationError,
} from "@/components/vault/vault-client";
import {
  VaultLibrary,
  type VaultLibraryCreateInput,
  type VaultLibraryMoveInput,
  type VaultLibraryPresentation,
  type VaultLibraryTarget,
} from "@/components/vault/vault-library";
import {
  closeWorkspaceTab,
  dockTargetFromPoint,
  dockWorkspaceTab,
  emptyPaneTabs,
  MAX_WORKSPACE_TABS,
  normalisePaneGeometry,
  paneForPath,
  paneSlots,
  pathIsWithin,
  pointIsWithinRect,
  remapPath,
  resolveWorkspaceTabDrop,
  removeWorkspaceTarget,
  tabStripAutoScrollDelta,
  undockWorkspaceTab,
  visiblePaneCount,
  workspaceTabStripPaths,
  type DockTarget,
  type EditorMode,
  type PaneSlot,
  type PaneTabs,
  type PathChange,
  type WorkspaceState,
  type WorkspaceTab as WorkspaceModelTab,
  type WorkspaceTabDropPosition,
} from "@/components/vault/workspace-model";
import { restoreWorkspace } from "@/components/vault/workspace-runtime";
import { createWorkspaceStorage } from "@/components/vault/workspace-storage";
import type { VaultItem, VaultSearchResult } from "@/components/vault/vault-types";
import {
  AttachmentIcon,
  CheckIcon,
  CloseIcon,
  CogIcon,
  DockBottomIcon,
  DockLeftIcon,
  DockRightIcon,
  DockTopIcon,
  EditIcon,
  ExternalLinkIcon,
  FolderOpenIcon,
  GraphIcon,
  LoadingIcon,
  NoteIcon,
  PreviewIcon,
} from "@/components/vault/vault-icons";
import type { AppIconProps } from "@/components/vault/vault-icons";
import { cn, formatRussianCount } from "@/lib/utils";

type VaultEntry = VaultItem;

type VaultFolderEntry = VaultFolder;

type WorkspaceView = "document" | "brain";
type PanelPosition = "left" | "right" | "top" | "bottom";
type PaneSplitAxis = "horizontal" | "vertical";
type TextFormat = "bold" | "italic" | "heading" | "list" | "quote" | "link";
type LibraryView = "tree" | "all";

type WorkspaceTab = WorkspaceModelTab<VaultEntry>;

type StoredLibrary = {
  expandedFolders?: unknown;
  order?: unknown;
  view?: unknown;
};

type FormattingHint = {
  left: number;
  top: number;
};

type HoverPreview = {
  item: VaultEntry;
  left: number;
  top: number;
};

type TabContextMenu = {
  path: string;
  x: number;
  y: number;
};

type TabDropIndicator = {
  position: "before" | "end";
  targetPath: string | null;
};

type DocumentHeading = {
  id: string;
  level: number;
  start: number;
  text: string;
};

type StoredPanelSize = {
  horizontal?: unknown;
  side?: unknown;
};

type PanelResizeSession = {
  pointerId: number;
  startCoordinate: number;
  startSize: number;
};

type PaneResizeSession = {
  pointerId: number;
};

type TabDragSession = {
  path: string;
  pointerId: number;
  startX: number;
  startY: number;
  started: boolean;
};

const PANEL_VISIBILITY_TRANSITION_MS = 180;
const TAB_DOCK_HORIZONTAL_MARGIN = 64;
const TAB_DOCK_VERTICAL_MARGIN = 24;
const PANEL_SIDE_DEFAULT_SIZE = 288;
const PANEL_SIDE_MIN_SIZE = 248;
const PANEL_SIDE_MAX_SIZE = 480;
const PANEL_HORIZONTAL_DEFAULT_SIZE = 288;
const PANEL_HORIZONTAL_MIN_SIZE = 216;
const PANEL_HORIZONTAL_MAX_SIZE = 480;
const PANEL_RESIZE_STEP = 16;
const PANE_MIN_SIZE = 248;
const PANE_RESIZE_STEP = 0.04;
const SCROLLBAR_HIDE_DELAY_MS = 700;
const SCROLLBAR_FADE_MS = 180;
type ScrollbarTimers = { fade?: number; hide?: number };
const scrollbarTimers = new WeakMap<HTMLElement, ScrollbarTimers>();

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

const dockOptions: Array<{
  value: PanelPosition;
  label: string;
  Icon: React.ComponentType<AppIconProps>;
}> = [
  { value: "left", label: "Переместить панель влево", Icon: DockLeftIcon },
  { value: "right", label: "Переместить панель вправо", Icon: DockRightIcon },
  { value: "top", label: "Переместить панель вверх", Icon: DockTopIcon },
  { value: "bottom", label: "Переместить панель вниз", Icon: DockBottomIcon },
];

const paneLabels: Record<PaneSlot, string> = {
  bottomLeft: "Снизу слева",
  bottomRight: "Снизу справа",
  topLeft: "Сверху слева",
  topRight: "Сверху справа",
};

const dockTargetLabels: Record<DockTarget, string> = {
  bottom: "снизу",
  left: "слева",
  right: "справа",
  top: "сверху",
};

const formatOptions: Array<{
  value: TextFormat;
  label: string;
  mark: string;
}> = [
  { value: "bold", label: "Полужирный", mark: "B" },
  { value: "italic", label: "Курсив", mark: "I" },
  { value: "heading", label: "Заголовок второго уровня", mark: "H2" },
  { value: "list", label: "Маркированный список", mark: "•" },
  { value: "quote", label: "Цитата", mark: "❝" },
  { value: "link", label: "Ссылка", mark: "↗" },
];

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function noteTitle(item: VaultEntry) {
  return item.name.replace(/\.md$/i, "");
}

function wordCount(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function markdownExcerpt(content: string) {
  return content
    .replace(/^\s*#{1,6}\s+.*(?:\n|$)/, "")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/^(?:[-*]|>)\s+/gm, "")
    .replace(/[*`_]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parentFolder(path: string) {
  const lastSlash = path.lastIndexOf("/");
  return lastSlash === -1 ? "" : path.slice(0, lastSlash);
}

function folderAncestors(folder: string) {
  const parts = folder.split("/").filter(Boolean);
  return parts.map((_, index) => parts.slice(0, index + 1).join("/"));
}

function extractMarkdownHeadings(content: string, idPrefix = "outline-heading"): DocumentHeading[] {
  const headings: DocumentHeading[] = [];
  let offset = 0;

  for (const line of content.split("\n")) {
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      headings.push({
        id: `${idPrefix}-${headings.length}`,
        level: match[1].length,
        start: offset,
        text: match[2].trim(),
      });
    }
    offset += line.length + 1;
  }

  return headings;
}

function getFormattingHintPosition(textarea: HTMLTextAreaElement, selectionStart: number): FormattingHint {
  const computed = window.getComputedStyle(textarea);
  const mirror = document.createElement("div");
  const marker = document.createElement("span");
  const copiedProperties = [
    "boxSizing",
    "width",
    "borderTopWidth",
    "borderRightWidth",
    "borderBottomWidth",
    "borderLeftWidth",
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
    "fontFamily",
    "fontSize",
    "fontWeight",
    "fontStyle",
    "letterSpacing",
    "lineHeight",
    "tabSize",
    "textTransform",
    "textIndent",
    "wordSpacing",
    "wordBreak",
    "overflowWrap",
    "textAlign",
    "direction",
  ] as const;

  mirror.style.position = "fixed";
  mirror.style.top = "0";
  mirror.style.left = "0";
  mirror.style.visibility = "hidden";
  mirror.style.pointerEvents = "none";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.overflow = "hidden";
  mirror.style.overflowWrap = "break-word";

  for (const property of copiedProperties) {
    mirror.style[property] = computed[property];
  }

  mirror.textContent = textarea.value.slice(0, selectionStart);
  marker.textContent = textarea.value.slice(selectionStart, selectionStart + 1) || "\u200b";
  mirror.append(marker);
  document.body.append(mirror);

  const markerRect = marker.getBoundingClientRect();
  const textareaRect = textarea.getBoundingClientRect();
  const lineHeight = Number.parseFloat(computed.lineHeight) || 28;
  mirror.remove();

  const rawLeft = textareaRect.left + markerRect.left - textarea.scrollLeft;
  const rawTop = textareaRect.top + markerRect.top - textarea.scrollTop - 44;
  const top = rawTop > 12
    ? rawTop
    : Math.min(window.innerHeight - 44, textareaRect.top + markerRect.top - textarea.scrollTop + lineHeight + 8);

  return {
    left: Math.max(12, Math.min(window.innerWidth - 313, rawLeft)),
    top: Math.max(12, top),
  };
}

function formatMarkdownSelection(format: TextFormat, value: string) {
  switch (format) {
    case "bold":
      return { value: `**${value}**`, selectionStart: 2, selectionEnd: value.length + 2 };
    case "italic":
      return { value: `*${value}*`, selectionStart: 1, selectionEnd: value.length + 1 };
    case "heading": {
      const formatted = value.split("\n").map((line) => (line ? `## ${line.replace(/^#{1,6}\s*/, "")}` : line)).join("\n");
      return { value: formatted, selectionStart: 0, selectionEnd: formatted.length };
    }
    case "list": {
      const formatted = value.split("\n").map((line) => (line ? `- ${line.replace(/^[-*]\s+/, "")}` : line)).join("\n");
      return { value: formatted, selectionStart: 0, selectionEnd: formatted.length };
    }
    case "quote": {
      const formatted = value.split("\n").map((line) => (line ? `> ${line.replace(/^>\s?/, "")}` : line)).join("\n");
      return { value: formatted, selectionStart: 0, selectionEnd: formatted.length };
    }
    case "link":
      return { value: `[${value}](https://)`, selectionStart: value.length + 3, selectionEnd: value.length + 11 };
  }
}

function PanelSettings({
  position,
  onOpenSettings,
  onPositionChange,
  onHide,
}: {
  position: PanelPosition;
  onOpenSettings: () => void;
  onPositionChange: (position: PanelPosition) => void;
  onHide: () => void;
}) {
  const itemClassName = "h-9 cursor-pointer rounded-md px-2.5 text-[13px] font-medium tracking-[-0.01em] transition-colors duration-150 hover:bg-accent/70 focus:bg-accent focus:text-accent-foreground active:bg-accent/80";
  const labelClassName = "px-2.5 pb-1 pt-1.5 text-[11px] font-semibold tracking-[0.01em] text-muted-foreground";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Настройки панели Vault"
          className="grid size-8 place-items-center rounded-md text-muted-foreground outline-none transition-colors duration-150 hover:bg-accent/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70"
          title="Настройки панели"
          type="button"
        >
          <span aria-hidden="true" className="text-[10px] font-bold leading-none tracking-[0.1em]">•••</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="vault-panel-settings-menu w-[13rem] rounded-xl p-1.5 shadow-sm" sideOffset={8}>
        <DropdownMenuLabel className={labelClassName}>Расположение</DropdownMenuLabel>
        {dockOptions.map(({ value, label, Icon }) => (
          <DropdownMenuItem className={cn(itemClassName, position === value && "bg-primary/10 text-foreground hover:bg-primary/15 focus:bg-primary/15")} key={value} onSelect={() => onPositionChange(value)}>
            <Icon className="size-3.5" />
            <span className="min-w-0 flex-1 truncate">{label.replace("Переместить панель ", "")}</span>
            {position === value ? <CheckIcon className="size-3.5 text-primary" motion="none" /> : null}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator className="my-1.5" />
        <DropdownMenuItem className={itemClassName} onSelect={onOpenSettings}>
          <CogIcon className="size-3.5" />
          <span className="min-w-0 flex-1">Настройки приложения</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator className="my-1.5" />
        <DropdownMenuItem className={cn(itemClassName, "mt-0.5 text-muted-foreground hover:text-foreground focus:text-foreground")} onSelect={onHide}>
          <CloseIcon className="size-3.5" />
          <span className="flex-1">Скрыть Vault</span>
          <span className="text-[10px] font-normal text-muted-foreground">⌘/Ctrl B</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MarkdownPreview({ content, headingPrefix }: { content: string; headingPrefix?: string }) {
  const blocks = content
    .trim()
    .split(/\n\s*\n/)
    .filter(Boolean);
  const headings = extractMarkdownHeadings(content, headingPrefix);
  let headingIndex = 0;

  if (blocks.length === 0) {
    return <p className="pt-5 text-[15px] leading-7 text-muted-foreground">В этой заметке пока нет текста.</p>;
  }

  return (
    <article aria-label="Предпросмотр Markdown" className="max-w-3xl text-[16px] leading-8 text-foreground">
      {blocks.map((block, index) => {
        const blockKey = `${index}-${block}`;
        const lines = block.split("\n");
        const heading = lines[0]?.match(/^(#{1,6})\s+(.+)$/);

        if (heading) {
          const level = heading[1].length;
          const title = heading[2];
          const outlineHeading = headings[headingIndex++];
          if (level === 1) {
            return <h2 className="mb-5 mt-1 scroll-mt-7 text-[2rem] font-semibold tracking-[-0.03em] text-foreground" data-outline-heading={outlineHeading?.id} id={outlineHeading?.id} key={blockKey}>{title}</h2>;
          }
          if (level === 2) {
            return <h3 className="mb-3 mt-9 scroll-mt-7 text-[1.45rem] font-semibold tracking-[-0.02em] text-foreground" data-outline-heading={outlineHeading?.id} id={outlineHeading?.id} key={blockKey}>{title}</h3>;
          }
          return <h4 className="mb-2 mt-7 scroll-mt-7 text-lg font-semibold text-foreground" data-outline-heading={outlineHeading?.id} id={outlineHeading?.id} key={blockKey}>{title}</h4>;
        }

        if (lines.every((line) => /^[-*]\s+/.test(line))) {
          return (
            <ul className="my-5 grid gap-1.5 pl-5 marker:text-primary" key={blockKey}>
              {lines.map((line) => <li key={`${block}-${line}`}>{line.replace(/^[-*]\s+/, "")}</li>)}
            </ul>
          );
        }

        if (lines.every((line) => line.startsWith("> "))) {
          return (
            <blockquote className="my-5 rounded-md bg-muted/75 px-4 py-3 text-muted-foreground" key={blockKey}>
              {lines.map((line) => <p key={`${block}-${line}`}>{line.replace(/^>\s?/, "")}</p>)}
            </blockquote>
          );
        }

        return (
          <p className="mb-5 text-pretty" key={blockKey}>
            {lines.map((line, lineIndex) => (
              <React.Fragment key={`${block}-${lineIndex}`}>
                {line}
                {lineIndex < lines.length - 1 ? <br /> : null}
              </React.Fragment>
            ))}
          </p>
        );
      })}
    </article>
  );
}

function DocumentOutline({
  activeHeadingId,
  headings,
  onNavigate,
}: {
  activeHeadingId: string | null;
  headings: DocumentHeading[];
  onNavigate: (heading: DocumentHeading) => void;
}) {
  return (
    <aside
      aria-label="Оглавление документа"
      className="group pointer-events-none absolute inset-y-0 right-0 z-20 hidden w-11 transition-[width] duration-200 ease-out hover:w-60 focus-within:w-60 xl:block"
    >
      <nav className="pointer-events-auto sticky top-7 max-h-[calc(100dvh-4rem)] w-full overflow-x-hidden overflow-y-auto rounded-xl border border-transparent bg-transparent py-2 transition-[background-color,border-color,box-shadow] duration-200 group-hover:border-border/80 group-hover:bg-popover group-hover:shadow-sm group-focus-within:border-border/80 group-focus-within:bg-popover group-focus-within:shadow-sm">
        <div className="flex h-8 items-center gap-2 whitespace-nowrap px-3 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
          <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-primary" />
          <p className="text-xs font-medium text-foreground">Содержание</p>
          <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">{headings.length}</span>
        </div>
        <div className="grid gap-0.5 px-1.5">
          {headings.map((heading) => (
            <button
              aria-current={activeHeadingId === heading.id ? "location" : undefined}
              className={cn(
                "relative flex h-8 w-full items-center overflow-hidden whitespace-nowrap rounded-md text-left text-sm leading-5 text-muted-foreground outline-none transition-[background-color,color,transform] duration-150 hover:bg-muted/70 hover:text-foreground active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70 group-hover:pr-5 group-focus-within:pr-5",
                activeHeadingId === heading.id && "font-medium text-foreground group-hover:bg-accent/60 group-focus-within:bg-accent/60",
              )}
              key={heading.id}
              onClick={() => onNavigate(heading)}
              style={{ paddingLeft: `${Math.min(heading.level - 1, 4) * 10 + 12}px` }}
              title={heading.text}
              type="button"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "absolute left-1/2 h-0.5 -translate-x-1/2 rounded-full bg-muted-foreground/45 transition-[width,opacity,background-color] duration-150 group-hover:opacity-0 group-focus-within:opacity-0",
                  activeHeadingId === heading.id && "bg-primary opacity-100",
                )}
                style={{ width: `${Math.max(12, 30 - Math.min(heading.level - 1, 4) * 4)}px` }}
              />
              <span className="block truncate opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">{heading.text}</span>
              <span
                aria-hidden="true"
                className={cn(
                  "absolute right-2 size-1 rounded-full bg-primary opacity-0 transition-opacity duration-150",
                  activeHeadingId === heading.id && "group-hover:opacity-100 group-focus-within:opacity-100",
                )}
              />
            </button>
          ))}
        </div>
      </nav>
    </aside>
  );
}

function LoadingCanvas() {
  return (
    <div aria-busy="true" className="mx-auto w-full max-w-3xl space-y-5 pt-4">
      <div className="h-9 w-2/5 animate-pulse rounded-md bg-muted" />
      <div className="h-4 w-full animate-pulse rounded bg-muted" />
      <div className="h-4 w-11/12 animate-pulse rounded bg-muted" />
      <div className="h-4 w-4/5 animate-pulse rounded bg-muted" />
    </div>
  );
}

function VaultWorkspace() {
  const prefersReducedMotion = useReducedMotion();
  const { settings } = useAppSettings();
  const { notify } = useNotifications();
  const vault = React.useMemo(() => createHttpVaultAdapter(), []);
  const workspaceStorage = React.useMemo(() => createWorkspaceStorage(), []);
  const theme = settings.theme;
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const importDirectoryRef = React.useRef("");
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const canvasScrollRef = React.useRef<HTMLDivElement>(null);
  const openRequestsRef = React.useRef<Record<string, number>>({});
  const openRequestSequenceRef = React.useRef(0);
  const hoverPreviewTimerRef = React.useRef<number | null>(null);
  const panelTransitionTimerRef = React.useRef<number | null>(null);
  const panelRef = React.useRef<HTMLElement>(null);
  const panelResizeSessionRef = React.useRef<PanelResizeSession | null>(null);
  const panelResizeCleanupRef = React.useRef<() => void>(() => undefined);
  const workspacePaneContainerRef = React.useRef<HTMLDivElement>(null);
  const paneResizeSessionRef = React.useRef<PaneResizeSession | null>(null);
  const paneResizeCleanupRef = React.useRef<() => void>(() => undefined);
  const tabDragSessionRef = React.useRef<TabDragSession | null>(null);
  const tabDragCleanupRef = React.useRef<() => void>(() => undefined);
  const tabStripScrollRef = React.useRef<HTMLDivElement>(null);
  const tabStripAutoScrollFrameRef = React.useRef<number | null>(null);
  const tabStripAutoScrollDeltaRef = React.useRef(0);
  const tabStripAutoScrollPointerRef = React.useRef<{ path: string; x: number; y: number } | null>(null);
  const hoverPreviewCacheRef = React.useRef<Record<string, string | null>>({});
  const hoverPreviewRequestsRef = React.useRef(new Set<string>());
  const libraryPreferencesReadyRef = React.useRef(false);
  const panelPreferencesReadyRef = React.useRef(false);
  const lastVisiblePanelRef = React.useRef<VaultLibraryPresentation>("expanded");
  const [items, setItems] = React.useState<VaultEntry[]>([]);
  const [folders, setFolders] = React.useState<VaultFolderEntry[]>([]);
  const [tabs, setTabs] = React.useState<WorkspaceTab[]>([]);
  const [draggedTabPath, setDraggedTabPath] = React.useState<string | null>(null);
  const [dockTarget, setDockTarget] = React.useState<DockTarget | null>(null);
  const [tabContextMenu, setTabContextMenu] = React.useState<TabContextMenu | null>(null);
  const [tabDropIndicator, setTabDropIndicator] = React.useState<TabDropIndicator | null>(null);
  const [activePath, setActivePath] = React.useState<string | null>(null);
  const [paneTabsState, setPaneTabsState] = React.useState<PaneTabs>(emptyPaneTabs);
  const paneTabs = React.useMemo(() => normalisePaneGeometry(paneTabsState), [paneTabsState]);
  const setPaneTabs = React.useCallback((update: React.SetStateAction<PaneTabs>) => {
    setPaneTabsState((current) => {
      const normalisedCurrent = normalisePaneGeometry(current);
      const next = typeof update === "function" ? update(normalisedCurrent) : update;
      return normalisePaneGeometry(next);
    });
  }, []);
  const [focusedPane, setFocusedPane] = React.useState<PaneSlot>("topLeft");
  const [paneSplitRatio, setPaneSplitRatio] = React.useState(0.5);
  const [isPaneResizing, setIsPaneResizing] = React.useState(false);
  const [libraryView, setLibraryView] = React.useState<LibraryView>("tree");
  const [expandedFolders, setExpandedFolders] = React.useState<string[]>([]);
  const [libraryOrder, setLibraryOrder] = React.useState<string[]>([]);
  const [graphFolder, setGraphFolder] = React.useState("all");
  const [workspaceView, setWorkspaceView] = React.useState<WorkspaceView>("document");
  const [panelPosition, setPanelPosition] = React.useState<PanelPosition>("right");
  const [panelPresentation, setPanelPresentation] = React.useState<VaultLibraryPresentation>("expanded");
  const [sidePanelSize, setSidePanelSize] = React.useState(PANEL_SIDE_DEFAULT_SIZE);
  const [horizontalPanelSize, setHorizontalPanelSize] = React.useState(PANEL_HORIZONTAL_DEFAULT_SIZE);
  const [isPanelResizing, setIsPanelResizing] = React.useState(false);
  const [isPanelClosing, setIsPanelClosing] = React.useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isWorkspaceReady, setIsWorkspaceReady] = React.useState(false);
  const [savingPaths, setSavingPaths] = React.useState<string[]>([]);
  const [isCreating, setIsCreating] = React.useState(false);
  const [isUploading, setIsUploading] = React.useState(false);
  const [busyLibraryPaths, setBusyLibraryPaths] = React.useState<string[]>([]);
  const [formattingHint, setFormattingHint] = React.useState<FormattingHint | null>(null);
  const [hoverPreview, setHoverPreview] = React.useState<HoverPreview | null>(null);
  const [hoverPreviewContentByPath, setHoverPreviewContentByPath] = React.useState<Record<string, string | null>>({});
  const [activeHeadingId, setActiveHeadingId] = React.useState<string | null>(null);
  const selectedTab = tabs.find((tab) => tab.item.path === activePath) ?? null;
  const selected = selectedTab?.item ?? null;
  const content = selectedTab?.content ?? "";
  const savedContent = selectedTab?.savedContent ?? "";
  const editorMode = selectedTab?.editorMode ?? "edit";
  const isSaving = activePath ? savingPaths.includes(activePath) : false;
  const activeFolder = graphFolder;

  function updateActiveTab(update: (tab: WorkspaceTab) => WorkspaceTab) {
    setTabs((current) => current.map((tab) => (
      tab.item.path === activePath ? update(tab) : tab
    )));
  }

  const setEditorMode = React.useCallback((nextMode: React.SetStateAction<EditorMode>) => {
    setTabs((current) => current.map((tab) => (
      tab.item.path === activePath
        ? { ...tab, editorMode: typeof nextMode === "function" ? nextMode(tab.editorMode) : nextMode }
        : tab
    )));
  }, [activePath]);

  function setContent(value: string) {
    updateActiveTab((tab) => ({ ...tab, content: value }));
  }

  function orderedTabStripPaths(paths: readonly string[]) {
    const groupedPaths = visiblePaneCount(paneTabs) > 1
      ? paneSlots.flatMap((slot) => paneTabs[slot] ? [paneTabs[slot]] : [])
      : [];
    return workspaceTabStripPaths(paths, groupedPaths);
  }

  function moveTab(
    draggedPath: string,
    targetPath: string | null,
    position: TabDropIndicator["position"],
  ) {
    setTabs((current) => {
      const paths = current.map((tab) => tab.item.path);
      const resolvedDrop = resolveWorkspaceTabDrop(
        orderedTabStripPaths(paths),
        draggedPath,
        targetPath,
        position,
      );
      if (!resolvedDrop) return current;
      if (resolvedDrop.paths.every((candidate, index) => candidate === paths[index])) return current;

      const tabByPath = new Map(current.map((tab) => [tab.item.path, tab]));
      return resolvedDrop.paths.map((candidate) => tabByPath.get(candidate) as WorkspaceTab);
    });
  }

  function tabDropIndicatorFromPoint(clientX: number, clientY: number, draggedPath: string): TabDropIndicator | null {
    const targetElement = document.elementFromPoint(clientX, clientY);
    if (!(targetElement instanceof HTMLElement)) return null;
    const draggedIsGrouped = visiblePaneCount(paneTabs) > 1 && paneForPath(paneTabs, draggedPath) !== null;
    const targetTab = targetElement.closest<HTMLElement>("[data-workspace-tab-drop-path]");
    const targetIsGrouped = targetElement.closest("[data-workspace-tab-group]") !== null;
    if (!draggedIsGrouped && targetIsGrouped) return null;

    let rawTargetPath: string | null = null;
    let rawPosition: WorkspaceTabDropPosition;
    if (targetElement.closest("[data-workspace-tab-strip-dropzone]")) {
      rawPosition = "end";
    } else {
      const targetPath = targetTab?.dataset.workspaceTabDropPath;
      if (!targetTab || !targetPath || targetPath === draggedPath) return null;
      const bounds = targetTab.getBoundingClientRect();
      rawTargetPath = targetPath;
      rawPosition = clientX < bounds.left + bounds.width / 2 ? "before" : "after";
    }

    const resolvedDrop = resolveWorkspaceTabDrop(
      orderedTabStripPaths(tabs.map((tab) => tab.item.path)),
      draggedPath,
      rawTargetPath,
      rawPosition,
    );
    const changesSplitMembership = draggedIsGrouped && !targetIsGrouped;
    if (!resolvedDrop || (!resolvedDrop.changesOrder && !changesSplitMembership)) return null;
    return { position: resolvedDrop.position, targetPath: resolvedDrop.targetPath };
  }

  function updateTabDropIndicator(next: TabDropIndicator | null) {
    setTabDropIndicator((current) => (
      current?.position === next?.position && current?.targetPath === next?.targetPath ? current : next
    ));
  }

  function stopTabStripAutoScroll() {
    tabStripAutoScrollDeltaRef.current = 0;
    tabStripAutoScrollPointerRef.current = null;
    if (tabStripAutoScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(tabStripAutoScrollFrameRef.current);
      tabStripAutoScrollFrameRef.current = null;
    }
  }

  function updateTabStripAutoScroll(clientX: number, clientY: number, path: string) {
    const strip = tabStripScrollRef.current;
    if (!strip) {
      stopTabStripAutoScroll();
      return;
    }

    const delta = tabStripAutoScrollDelta(strip.getBoundingClientRect(), clientX, clientY);
    tabStripAutoScrollDeltaRef.current = delta;
    tabStripAutoScrollPointerRef.current = delta === 0 ? null : { path, x: clientX, y: clientY };
    if (delta === 0) {
      stopTabStripAutoScroll();
      return;
    }
    if (tabStripAutoScrollFrameRef.current !== null) return;

    const scroll = () => {
      const scrollElement = tabStripScrollRef.current;
      const pointer = tabStripAutoScrollPointerRef.current;
      const scrollDelta = tabStripAutoScrollDeltaRef.current;
      if (!scrollElement || !pointer || scrollDelta === 0) {
        stopTabStripAutoScroll();
        return;
      }

      const previousScrollLeft = scrollElement.scrollLeft;
      scrollElement.scrollLeft += scrollDelta;
      if (scrollElement.scrollLeft === previousScrollLeft) {
        stopTabStripAutoScroll();
        return;
      }

      updateTabDropIndicator(tabDropIndicatorFromPoint(pointer.x, pointer.y, pointer.path));
      tabStripAutoScrollFrameRef.current = window.requestAnimationFrame(scroll);
    };

    tabStripAutoScrollFrameRef.current = window.requestAnimationFrame(scroll);
  }

  function beginTabDrag(event: React.PointerEvent<HTMLElement>, path: string) {
    if (event.button !== 0) return;
    tabDragCleanupRef.current();
    stopTabStripAutoScroll();
    const dragHandle = event.currentTarget;
    dragHandle.setPointerCapture(event.pointerId);
    tabDragSessionRef.current = {
      path,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      started: false,
    };

    function moveDraggedTab(pointerEvent: PointerEvent) {
      const session = tabDragSessionRef.current;
      if (!session || session.pointerId !== pointerEvent.pointerId) return;
      const distance = Math.hypot(pointerEvent.clientX - session.startX, pointerEvent.clientY - session.startY);
      if (!session.started && distance < 4) return;

      if (!session.started) {
        session.started = true;
        setDraggedTabPath(session.path);
      }

      const workspaceRect = workspacePaneContainerRef.current?.getBoundingClientRect();
      const isOverWorkspace = workspaceRect && pointIsWithinRect(
        workspaceRect,
        pointerEvent.clientX,
        pointerEvent.clientY,
        TAB_DOCK_HORIZONTAL_MARGIN,
        TAB_DOCK_VERTICAL_MARGIN,
      );
      if (isOverWorkspace) {
        setDockTarget(dockTargetFromPoint(workspaceRect, pointerEvent.clientX, pointerEvent.clientY));
        updateTabDropIndicator(null);
        stopTabStripAutoScroll();
      } else {
        setDockTarget(null);
        updateTabStripAutoScroll(pointerEvent.clientX, pointerEvent.clientY, session.path);
        updateTabDropIndicator(tabDropIndicatorFromPoint(
          pointerEvent.clientX,
          pointerEvent.clientY,
          session.path,
        ));
      }
      pointerEvent.preventDefault();
    }

    function finishDraggedTab(pointerEvent: PointerEvent) {
      const session = tabDragSessionRef.current;
      if (!session || session.pointerId !== pointerEvent.pointerId) return;
      const wasDragging = session.started;
      const draggedPath = session.path;
      tabDragSessionRef.current = null;
      tabDragCleanupRef.current();
      if (!wasDragging) return;

      const workspaceRect = workspacePaneContainerRef.current?.getBoundingClientRect();
      const isOverWorkspace = workspaceRect && pointIsWithinRect(
        workspaceRect,
        pointerEvent.clientX,
        pointerEvent.clientY,
        TAB_DOCK_HORIZONTAL_MARGIN,
        TAB_DOCK_VERTICAL_MARGIN,
      );
      setTabDropIndicator(null);
      stopTabStripAutoScroll();

      if (isOverWorkspace && tabs.length >= 2) {
        const target = dockTargetFromPoint(workspaceRect, pointerEvent.clientX, pointerEvent.clientY);
        dockTab(draggedPath, target);
      } else {
        const targetElement = document.elementFromPoint(pointerEvent.clientX, pointerEvent.clientY);
        const tabDrop = tabDropIndicatorFromPoint(
          pointerEvent.clientX,
          pointerEvent.clientY,
          draggedPath,
        );
        const droppedOnTabStrip = targetElement instanceof HTMLElement
          && targetElement.closest("[data-workspace-tab-strip]") !== null;
        const droppedInsideSplitGroup = targetElement instanceof HTMLElement
          && targetElement.closest("[data-workspace-tab-group]") !== null;
        if (tabDrop) moveTab(draggedPath, tabDrop.targetPath, tabDrop.position);
        if (paneForPath(paneTabs, draggedPath) && droppedOnTabStrip && !droppedInsideSplitGroup) {
          undockTab(draggedPath, Boolean(tabDrop));
        }
        setDockTarget(null);
        setDraggedTabPath(null);
        setTabDropIndicator(null);
      }
      pointerEvent.preventDefault();
    }

    function cancelDraggedTab(pointerEvent: PointerEvent) {
      const session = tabDragSessionRef.current;
      if (!session || session.pointerId !== pointerEvent.pointerId) return;
      tabDragSessionRef.current = null;
      setDockTarget(null);
      setDraggedTabPath(null);
      setTabDropIndicator(null);
      stopTabStripAutoScroll();
      tabDragCleanupRef.current();
    }

    const cleanup = () => {
      window.removeEventListener("pointermove", moveDraggedTab);
      window.removeEventListener("pointerup", finishDraggedTab);
      window.removeEventListener("pointercancel", cancelDraggedTab);
      if (dragHandle.hasPointerCapture(event.pointerId)) dragHandle.releasePointerCapture(event.pointerId);
    };
    tabDragCleanupRef.current = cleanup;
    window.addEventListener("pointermove", moveDraggedTab, { passive: false });
    window.addEventListener("pointerup", finishDraggedTab, { passive: false });
    window.addEventListener("pointercancel", cancelDraggedTab);
    event.preventDefault();
  }

  React.useEffect(() => () => {
    if (hoverPreviewTimerRef.current !== null) window.clearTimeout(hoverPreviewTimerRef.current);
  }, []);

  React.useEffect(() => () => {
    if (panelTransitionTimerRef.current !== null) window.clearTimeout(panelTransitionTimerRef.current);
    if (tabStripAutoScrollFrameRef.current !== null) window.cancelAnimationFrame(tabStripAutoScrollFrameRef.current);
    panelResizeCleanupRef.current();
    paneResizeCleanupRef.current();
    tabDragCleanupRef.current();
  }, []);

  React.useEffect(() => {
    const {
      compact: storedCompact,
      position: storedPosition,
      presentation: storedPresentation,
      size: storedSize,
    } = workspaceStorage.readPanelPreferences();
    const frame = window.requestAnimationFrame(() => {
      if (storedPosition === "left" || storedPosition === "right" || storedPosition === "top" || storedPosition === "bottom") {
        setPanelPosition(storedPosition);
      }
      if (storedPresentation === "expanded" || storedPresentation === "compact" || storedPresentation === "hidden") {
        setPanelPresentation(storedPresentation);
      } else if (storedCompact === "true") {
        setPanelPresentation("compact");
      }
      if (typeof storedSize.side === "number" && Number.isFinite(storedSize.side)) {
        setSidePanelSize(Math.min(PANEL_SIDE_MAX_SIZE, Math.max(PANEL_SIDE_MIN_SIZE, storedSize.side)));
      }
      if (typeof storedSize.horizontal === "number" && Number.isFinite(storedSize.horizontal)) {
        setHorizontalPanelSize(Math.min(PANEL_HORIZONTAL_MAX_SIZE, Math.max(PANEL_HORIZONTAL_MIN_SIZE, storedSize.horizontal)));
      }
      panelPreferencesReadyRef.current = true;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [workspaceStorage]);

  React.useEffect(() => {
    const stored = workspaceStorage.readLibraryPreferences() as StoredLibrary;

    const storedFolders = Array.isArray(stored.expandedFolders)
      ? stored.expandedFolders.filter((folder): folder is string => typeof folder === "string")
      : [];
    const storedView = stored.view === "all" ? "all" : "tree";
    const storedOrder = Array.isArray(stored.order)
      ? stored.order.filter((item): item is string => typeof item === "string")
      : [];
    const frame = window.requestAnimationFrame(() => {
      setExpandedFolders(storedFolders);
      setLibraryView(storedView);
      setLibraryOrder(storedOrder);
      libraryPreferencesReadyRef.current = true;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [workspaceStorage]);

  React.useEffect(() => {
    if (!panelPreferencesReadyRef.current) return;
    workspaceStorage.writePanelPreferences({
      position: panelPosition,
      presentation: panelPresentation,
      size: {
        horizontal: horizontalPanelSize,
        side: sidePanelSize,
      } satisfies StoredPanelSize,
    });
  }, [horizontalPanelSize, panelPosition, panelPresentation, sidePanelSize, workspaceStorage]);

  React.useEffect(() => {
    if (!libraryPreferencesReadyRef.current) return;
    workspaceStorage.writeLibraryPreferences({
      expandedFolders,
      order: libraryOrder,
      view: libraryView,
    } satisfies StoredLibrary);
  }, [expandedFolders, libraryOrder, libraryView, workspaceStorage]);

  React.useEffect(() => {
    function toggleQuickPreview(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "h") return;
      if (event.target !== textareaRef.current) return;

      event.preventDefault();
      setFormattingHint(null);
      setEditorMode((mode) => (mode === "split" ? "edit" : "split"));
    }

    window.addEventListener("keydown", toggleQuickPreview);
    return () => window.removeEventListener("keydown", toggleQuickPreview);
  }, [setEditorMode]);

  React.useEffect(() => {
    if (panelPresentation !== "hidden") lastVisiblePanelRef.current = panelPresentation;
  }, [panelPresentation]);

  const changePanelPresentation = React.useCallback((nextPresentation: VaultLibraryPresentation) => {
    if (nextPresentation === panelPresentation || isPanelClosing) return;
    if (panelTransitionTimerRef.current !== null) window.clearTimeout(panelTransitionTimerRef.current);

    if (nextPresentation === "hidden" && !prefersReducedMotion) {
      setIsPanelClosing(true);
      panelTransitionTimerRef.current = window.setTimeout(() => {
        setPanelPresentation("hidden");
        setIsPanelClosing(false);
        panelTransitionTimerRef.current = null;
      }, PANEL_VISIBILITY_TRANSITION_MS);
      return;
    }

    setPanelPresentation(nextPresentation);
  }, [isPanelClosing, panelPresentation, prefersReducedMotion]);

  React.useEffect(() => {
    function toggleVaultPanel(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "b") return;
      event.preventDefault();
      changePanelPresentation(panelPresentation === "hidden" ? lastVisiblePanelRef.current : "hidden");
    }

    window.addEventListener("keydown", toggleVaultPanel);
    return () => window.removeEventListener("keydown", toggleVaultPanel);
  }, [changePanelPresentation, panelPresentation]);

  function focusPane(slot: PaneSlot, path: string) {
    setFocusedPane(slot);
    setActivePath(path);
    setWorkspaceView("document");
    setFormattingHint(null);
  }

  function focusPath(path: string) {
    const existingPane = paneForPath(paneTabs, path);
    if (existingPane) {
      focusPane(existingPane, path);
      return;
    }

    const destination = paneTabs[focusedPane] ? focusedPane : "topLeft";
    setPaneTabs((current) => ({ ...current, [destination]: path }));
    focusPane(destination, path);
  }

  function revealFolder(folder: string) {
    setLibraryView("tree");
    if (!folder) return;
    const ancestors = folderAncestors(folder);
    setExpandedFolders((current) => [...new Set([...current, ...ancestors])]);
  }

  async function openItem(item: VaultEntry) {
    const existingTab = tabs.find((tab) => tab.item.path === item.path);
    if (existingTab) {
      focusPath(item.path);
      return;
    }

    if (tabs.length >= MAX_WORKSPACE_TABS) {
      notify({
        kind: "warning",
        message: `Можно открыть не больше ${MAX_WORKSPACE_TABS} вкладок. Закройте одну из открытых.`,
        dedupeKey: "open-tabs-limit",
      });
      return;
    }

    openRequestSequenceRef.current += 1;
    const requestId = openRequestSequenceRef.current;
    openRequestsRef.current[item.path] = requestId;
    const nextTab: WorkspaceTab = {
      content: "",
      editorMode: "edit",
      isLoading: item.kind === "note",
      item,
      savedContent: "",
    };

    const destination = paneTabs[focusedPane] ? focusedPane : "topLeft";
    setTabs((current) => [...current, nextTab]);
    setPaneTabs((current) => ({ ...current, [destination]: item.path }));
    setFocusedPane(destination);
    setActivePath(item.path);
    setWorkspaceView("document");
    setFormattingHint(null);

    if (item.kind === "attachment") return;

    try {
      const noteContent = await vault.readNote(item.path);
      if (openRequestsRef.current[item.path] !== requestId) return;
      setTabs((current) => current.map((tab) => tab.item.path === item.path
        ? { ...tab, content: noteContent, isLoading: false, savedContent: noteContent }
        : tab));
    } catch (error) {
      if (openRequestsRef.current[item.path] !== requestId) return;
      const fallbackPath = tabs.at(-1)?.item.path ?? null;
      setTabs((current) => current.filter((tab) => tab.item.path !== item.path));
      setPaneTabs((current) => {
        const nextPanes = paneSlots.reduce<PaneTabs>((next, slot) => ({
          ...next,
          [slot]: current[slot] === item.path ? null : current[slot],
        }), { ...emptyPaneTabs });
        if (!paneForPath(nextPanes, fallbackPath ?? "") && fallbackPath) {
          const fallbackPane = paneForPath(nextPanes, fallbackPath);
          if (fallbackPane) nextPanes[fallbackPane] = null;
          nextPanes[paneSlots.find((slot) => !nextPanes[slot]) ?? "topLeft"] = fallbackPath;
        }
        return nextPanes;
      });
      setFocusedPane("topLeft");
      setActivePath((current) => current === item.path ? fallbackPath : current);
      notify({
        kind: "error",
        message: error instanceof Error ? error.message : "Не удалось открыть заметку",
        dedupeKey: `open-note:${item.path}`,
      });
    }
  }

  async function refreshItems() {
    const snapshot = await vault.listSnapshot();
    setItems(snapshot.items);
    setFolders(snapshot.folders);
    return snapshot.items;
  }

  async function loadHoverPreview(item: VaultEntry) {
    if (item.kind !== "note" || item.path in hoverPreviewCacheRef.current || hoverPreviewRequestsRef.current.has(item.path)) return;

    hoverPreviewRequestsRef.current.add(item.path);
    try {
      const noteContent = await vault.readNote(item.path);
      hoverPreviewCacheRef.current[item.path] = noteContent;
      setHoverPreviewContentByPath((current) => ({ ...current, [item.path]: noteContent }));
    } catch (error) {
      if (error instanceof VaultOperationError && error.retryable) return;
      hoverPreviewCacheRef.current[item.path] = null;
      setHoverPreviewContentByPath((current) => ({ ...current, [item.path]: null }));
    } finally {
      hoverPreviewRequestsRef.current.delete(item.path);
    }
  }

  function cancelHoverPreviewDismissal() {
    if (hoverPreviewTimerRef.current === null) return;
    window.clearTimeout(hoverPreviewTimerRef.current);
    hoverPreviewTimerRef.current = null;
  }

  function scheduleHoverPreviewDismissal() {
    cancelHoverPreviewDismissal();
    hoverPreviewTimerRef.current = window.setTimeout(() => {
      setHoverPreview(null);
      hoverPreviewTimerRef.current = null;
    }, 100);
  }

  function showHoverPreview(item: VaultEntry, target: HTMLButtonElement) {
    if (item.kind !== "note") return;

    cancelHoverPreviewDismissal();
    const targetRect = target.getBoundingClientRect();
    const previewWidth = Math.min(352, window.innerWidth - 24);
    const opensToLeft = panelPosition === "right" || (panelPosition !== "left" && targetRect.left > window.innerWidth / 2);
    const left = Math.max(
      12,
      Math.min(
        window.innerWidth - previewWidth - 12,
        opensToLeft ? targetRect.left - previewWidth - 12 : targetRect.right + 12,
      ),
    );
    const top = Math.max(12, Math.min(window.innerHeight - 232, targetRect.top - 8));

    void loadHoverPreview(item);
    hoverPreviewTimerRef.current = window.setTimeout(() => {
      setHoverPreview({ item, left, top });
      hoverPreviewTimerRef.current = null;
    }, 80);
  }

  React.useEffect(() => {
    let active = true;
    const restoreController = new AbortController();

    void (async () => {
      try {
        const restored = await restoreWorkspace(vault, workspaceStorage, restoreController.signal);
        if (!active || !restored) return;
        for (const failure of restored.failures) {
          notify({
            kind: "error",
            message: failure.message,
            dedupeKey: failure.dedupeKey,
          });
        }

        setItems(restored.items);
        setFolders(restored.folders);
        setTabs(restored.tabs);
        setActivePath(restored.workspace.activePath);
        setPaneTabs(restored.workspace.panes);
        setFocusedPane(restored.workspace.focusedPane);
        setPaneSplitRatio(restored.workspace.splitRatio);
      } catch (error) {
        if (active) {
          notify({
            kind: "error",
            message: error instanceof Error ? error.message : "Не удалось открыть Vault",
            dedupeKey: "open-vault",
          });
        }
      } finally {
        if (active) {
          setIsLoading(false);
          setIsWorkspaceReady(true);
        }
      }
    })();

    return () => {
      active = false;
      restoreController.abort();
    };
  }, [notify, setPaneTabs, vault, workspaceStorage]);

  React.useEffect(() => {
    if (!isWorkspaceReady) return;
    const timer = window.setTimeout(() => {
      workspaceStorage.writeWorkspace({
        activePath,
        focusedPane,
        openPaths: tabs.map((tab) => tab.item.path),
        panes: paneTabs,
        splitRatio: paneSplitRatio,
      } satisfies WorkspaceState);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [activePath, focusedPane, isWorkspaceReady, paneSplitRatio, paneTabs, tabs, workspaceStorage]);

  async function createLibraryNote({ directory, name }: VaultLibraryCreateInput) {
    setIsCreating(true);

    try {
      const item = await vault.createNote({ directory, name });
      revealFolder(parentFolder(item.path));
      await refreshItems();
      await openItem(item);
    } catch (error) {
      throw error;
    } finally {
      setIsCreating(false);
    }
  }

  async function uploadFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setIsUploading(true);

    try {
      const item = await vault.upload(file, importDirectoryRef.current);
      revealFolder(parentFolder(item.path));
      await refreshItems();
      await openItem(item);
      notify({
        kind: "success",
        message: `Файл «${item.name}» добавлен`,
        dedupeKey: "upload-file",
      });
    } catch (error) {
      notify({
        kind: "error",
        message: error instanceof Error ? error.message : "Не удалось добавить файл",
        dedupeKey: "upload-file-error",
      });
    } finally {
      setIsUploading(false);
    }
  }

  async function createLibraryFolder({ directory, name }: VaultLibraryCreateInput) {
    setBusyLibraryPaths((current) => [...new Set([...current, directory || "__root__"])]);

    try {
      const folder = await vault.createFolder({ directory, name });
      await refreshItems();
      revealFolder(folder.path);
    } catch (error) {
      throw error;
    } finally {
      setBusyLibraryPaths((current) => current.filter((path) => path !== (directory || "__root__")));
    }
  }

  function normalisePathChanges(body: Partial<VaultMutation>) {
    if (Array.isArray(body.pathChanges) && body.pathChanges.length > 0) return body.pathChanges;
    return body.oldPath && body.newPath ? [{ from: body.oldPath, to: body.newPath }] : [];
  }

  function applyPathChanges(changes: readonly PathChange[], nextItems: readonly VaultEntry[]) {
    if (changes.length === 0) return;
    const itemsByPath = new Map(nextItems.map((item) => [item.path, item]));

    setTabs((current) => current.map((tab) => {
      const nextPath = remapPath(tab.item.path, changes);
      return {
        ...tab,
        item: itemsByPath.get(nextPath) ?? {
          ...tab.item,
          name: nextPath.split("/").at(-1) ?? tab.item.name,
          path: nextPath,
        },
      };
    }));
    setActivePath((current) => current ? remapPath(current, changes) : null);
    setPaneTabs((current) => paneSlots.reduce<PaneTabs>((next, slot) => ({
      ...next,
      [slot]: current[slot] ? remapPath(current[slot], changes) : null,
    }), { ...emptyPaneTabs }));
    setExpandedFolders((current) => [...new Set(current.map((folder) => remapPath(folder, changes)))]);
    setLibraryOrder((current) => current.map((path) => remapPath(path, changes)));
    setSavingPaths((current) => current.map((path) => remapPath(path, changes)));
    setGraphFolder((current) => current === "all" ? current : remapPath(current, changes));
    setHoverPreview(null);

    const nextOpenRequests: Record<string, number> = {};
    for (const [path, value] of Object.entries(openRequestsRef.current)) {
      nextOpenRequests[remapPath(path, changes)] = value;
    }
    openRequestsRef.current = nextOpenRequests;
    hoverPreviewRequestsRef.current = new Set(
      [...hoverPreviewRequestsRef.current].map((path) => remapPath(path, changes)),
    );

    const nextPreviewCache: Record<string, string | null> = {};
    for (const [path, value] of Object.entries(hoverPreviewCacheRef.current)) {
      nextPreviewCache[remapPath(path, changes)] = value;
    }
    hoverPreviewCacheRef.current = nextPreviewCache;
    setHoverPreviewContentByPath((current) => {
      const next: Record<string, string | null> = {};
      for (const [path, value] of Object.entries(current)) next[remapPath(path, changes)] = value;
      return next;
    });
  }

  function targetHasPendingOperation(target: VaultLibraryTarget) {
    const includesPath = (path: string) => target.kind === "folder"
      ? pathIsWithin(path, target.path)
      : path === target.path;
    return savingPaths.some(includesPath)
      || tabs.some((tab) => tab.isLoading && includesPath(tab.item.path));
  }

  function requireIdleTarget(target: VaultLibraryTarget) {
    if (!targetHasPendingOperation(target)) return;
    throw new Error("Дождитесь окончания загрузки или сохранения файла");
  }

  async function renameLibraryTarget(target: VaultLibraryTarget, name: string) {
    requireIdleTarget(target);
    setBusyLibraryPaths((current) => [...new Set([...current, target.path])]);

    try {
      const mutation = await vault.rename(target.path, name);
      const changes = normalisePathChanges(mutation);
      const nextItems = await refreshItems();
      applyPathChanges(changes, nextItems);
    } catch (error) {
      throw error;
    } finally {
      setBusyLibraryPaths((current) => current.filter((path) => path !== target.path));
    }
  }

  async function moveLibraryTarget(input: VaultLibraryMoveInput) {
    requireIdleTarget(input);
    const currentDirectory = parentFolder(input.path);
    if (input.destination === currentDirectory) return;
    if (input.kind === "folder" && pathIsWithin(input.destination, input.path)) {
      throw new Error("Нельзя переместить папку внутрь самой себя");
    }

    setBusyLibraryPaths((current) => [...new Set([...current, input.path])]);
    try {
      const mutation = await vault.move(input.path, input.destination);
      const changes = normalisePathChanges(mutation);
      const nextItems = await refreshItems();
      applyPathChanges(changes, nextItems);
      revealFolder(input.destination);
    } catch (error) {
      throw error;
    } finally {
      setBusyLibraryPaths((current) => current.filter((path) => path !== input.path));
    }
  }

  function removeTargetFromWorkspace(target: VaultLibraryTarget) {
    const isRemoved = (path: string) => target.kind === "folder" ? pathIsWithin(path, target.path) : path === target.path;
    const nextWorkspace = removeWorkspaceTarget({
      activePath,
      focusedPane,
      openPaths: tabs.map((tab) => tab.item.path),
      panes: paneTabs,
      splitRatio: paneSplitRatio,
    }, target);

    setTabs((current) => current.filter((tab) => !isRemoved(tab.item.path)));
    setPaneTabs(nextWorkspace.panes);
    setActivePath(nextWorkspace.activePath);
    setFocusedPane(nextWorkspace.focusedPane);
    setExpandedFolders((current) => current.filter((folder) => !isRemoved(folder)));
    setLibraryOrder((current) => current.filter((path) => !isRemoved(path)));
    setSavingPaths((current) => current.filter((path) => !isRemoved(path)));
    setGraphFolder((current) => current !== "all" && isRemoved(current) ? "all" : current);
    setHoverPreview(null);
    for (const path of Object.keys(openRequestsRef.current)) {
      if (isRemoved(path)) delete openRequestsRef.current[path];
    }
    for (const path of Object.keys(hoverPreviewCacheRef.current)) {
      if (isRemoved(path)) delete hoverPreviewCacheRef.current[path];
    }
    hoverPreviewRequestsRef.current = new Set(
      [...hoverPreviewRequestsRef.current].filter((path) => !isRemoved(path)),
    );
    setHoverPreviewContentByPath((current) => Object.fromEntries(
      Object.entries(current).filter(([path]) => !isRemoved(path)),
    ));
  }

  async function deleteLibraryTarget(target: VaultLibraryTarget) {
    requireIdleTarget(target);
    const hasDirtyNote = tabs.some((tab) => (
      (target.kind === "folder" ? pathIsWithin(tab.item.path, target.path) : tab.item.path === target.path)
      && tab.item.kind === "note"
      && tab.content !== tab.savedContent
    ));
    if (hasDirtyNote) {
      throw new Error("Сначала сохраните изменения в открытых заметках");
    }

    setBusyLibraryPaths((current) => [...new Set([...current, target.path])]);
    try {
      await vault.delete(target.path);
      removeTargetFromWorkspace(target);
      await refreshItems();
    } catch (error) {
      throw error;
    } finally {
      setBusyLibraryPaths((current) => current.filter((path) => path !== target.path));
    }
  }

  async function searchVault(query: string): Promise<readonly VaultSearchResult[]> {
    return vault.search(query);
  }

  function openImportPicker(directory: string) {
    importDirectoryRef.current = directory;
    fileInputRef.current?.click();
  }

  async function saveNote() {
    if (!selected || selected.kind !== "note") return;

    const path = selected.path;
    setSavingPaths((current) => current.includes(path) ? current : [...current, path]);

    try {
      const item = await vault.saveNote(selected.path, content);
      setItems((current) => current.map((candidate) => (candidate.path === item.path ? item : candidate)));
      setTabs((current) => current.map((tab) => tab.item.path === item.path
        ? { ...tab, item, savedContent: content }
        : tab));
      hoverPreviewCacheRef.current[item.path] = content;
      setHoverPreviewContentByPath((current) => ({ ...current, [item.path]: content }));
      notify({
        kind: "success",
        message: "Изменения сохранены в Markdown-файл",
        dedupeKey: `save-note:${path}`,
      });
    } catch (error) {
      notify({
        kind: "error",
        message: error instanceof Error ? error.message : "Не удалось сохранить заметку",
        dedupeKey: `save-note-error:${path}`,
      });
    } finally {
      setSavingPaths((current) => current.filter((candidate) => candidate !== path));
    }
  }

  function closeTab(path: string) {
    const tab = tabs.find((candidate) => candidate.item.path === path);
    if (!tab) return;
    if (tab.item.kind === "note" && tab.content !== tab.savedContent) {
      notify({
        kind: "warning",
        message: "Сначала сохраните изменения, затем закройте вкладку.",
        dedupeKey: `close-dirty-tab:${path}`,
      });
      return;
    }

    const remainingTabs = tabs.filter((candidate) => candidate.item.path !== path);
    const nextWorkspace = closeWorkspaceTab({
      activePath,
      focusedPane,
      openPaths: tabs.map((candidate) => candidate.item.path),
      panes: paneTabs,
      splitRatio: paneSplitRatio,
    }, path);

    setTabs(remainingTabs);
    setPaneTabs(nextWorkspace.panes);
    setActivePath(nextWorkspace.activePath);
    setFocusedPane(nextWorkspace.focusedPane);
    delete openRequestsRef.current[path];
    setFormattingHint(null);
  }

  function undockTab(path: string, preserveTabOrder = false) {
    const nextWorkspace = undockWorkspaceTab({
      activePath,
      focusedPane,
      openPaths: tabs.map((tab) => tab.item.path),
      panes: paneTabs,
      splitRatio: paneSplitRatio,
    }, path);
    if (nextWorkspace.panes === paneTabs) return;

    if (!preserveTabOrder) {
      setTabs((current) => {
        const paths = current.map((tab) => tab.item.path);
        const orderedPaths = orderedTabStripPaths(paths);
        if (orderedPaths.every((candidate, index) => candidate === paths[index])) return current;

        const tabByPath = new Map(current.map((tab) => [tab.item.path, tab]));
        return orderedPaths.map((candidate) => tabByPath.get(candidate) as WorkspaceTab);
      });
    }

    setPaneTabs(nextWorkspace.panes);
    setActivePath(nextWorkspace.activePath);
    setFocusedPane(nextWorkspace.focusedPane);
  }

  function collapsePane(slot: PaneSlot) {
    const path = paneTabs[slot];
    if (path) undockTab(path);
  }

  function dockTab(path: string, target: DockTarget) {
    if (tabs.length < 2) {
      notify({
        kind: "warning",
        message: "Откройте хотя бы две вкладки, чтобы поставить файлы рядом.",
        dedupeKey: "dock-needs-tabs",
      });
      setDockTarget(null);
      setDraggedTabPath(null);
      return;
    }

    const currentWorkspace: WorkspaceState = {
      activePath,
      focusedPane,
      openPaths: tabs.map((tab) => tab.item.path),
      panes: paneTabs,
      splitRatio: paneSplitRatio,
    };
    const nextWorkspace = dockWorkspaceTab(currentWorkspace, path, target);
    if (nextWorkspace === currentWorkspace) {
      notify({
        kind: "warning",
        message: "На экране уже четыре файла. Сверните одну область или переместите открытую вкладку.",
        dedupeKey: "dock-pane-limit",
      });
      setDockTarget(null);
      setDraggedTabPath(null);
      return;
    }
    setPaneTabs(nextWorkspace.panes);
    setPaneSplitRatio(nextWorkspace.splitRatio);
    setFocusedPane(nextWorkspace.focusedPane);
    setActivePath(nextWorkspace.activePath);
    setWorkspaceView("document");
    setFormattingHint(null);
    setDockTarget(null);
    setDraggedTabPath(null);
  }

  function activateTab(path: string) {
    focusPath(path);
  }

  function updateFormattingHint() {
    const textarea = textareaRef.current;
    if (!textarea || textarea.selectionStart === textarea.selectionEnd) {
      setFormattingHint(null);
      return;
    }

    const selection = textarea.value.slice(textarea.selectionStart, textarea.selectionEnd);
    if (!selection.trim()) {
      setFormattingHint(null);
      return;
    }

    setFormattingHint(getFormattingHintPosition(textarea, textarea.selectionStart));
  }

  function applyFormatting(format: TextFormat) {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const selectionStart = textarea.selectionStart;
    const selectionEnd = textarea.selectionEnd;
    const currentContent = textarea.value;
    const selection = currentContent.slice(selectionStart, selectionEnd);
    if (!selection.trim()) return;

    const formatted = formatMarkdownSelection(format, selection);
    const nextContent = `${currentContent.slice(0, selectionStart)}${formatted.value}${currentContent.slice(selectionEnd)}`;
    setContent(nextContent);
    setFormattingHint(null);

    window.requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(
        selectionStart + formatted.selectionStart,
        selectionStart + formatted.selectionEnd,
      );
    });
  }

  const documentHeadings = extractMarkdownHeadings(content);
  const currentHeadingId = documentHeadings.some((heading) => heading.id === activeHeadingId)
    ? activeHeadingId
    : documentHeadings[0]?.id ?? null;

  function updateActiveHeadingFromEditor() {
    const textarea = textareaRef.current;
    if (!textarea) return;

    let nextHeading = documentHeadings[0];
    for (const heading of documentHeadings) {
      if (heading.start > textarea.selectionStart) break;
      nextHeading = heading;
    }
    setActiveHeadingId(nextHeading?.id ?? null);
  }

  function updateActiveHeadingFromPreview() {
    if (editorMode === "edit") return;

    const container = canvasScrollRef.current;
    if (!container) return;

    const isCanvasScrollable = container.scrollHeight > container.clientHeight;
    const anchor = isCanvasScrollable ? container.getBoundingClientRect().top + 92 : 92;
    let nextHeadingId = documentHeadings[0]?.id ?? null;
    for (const element of container.querySelectorAll<HTMLElement>("[data-outline-heading]")) {
      if (element.getBoundingClientRect().top > anchor) break;
      nextHeadingId = element.dataset.outlineHeading ?? nextHeadingId;
    }
    setActiveHeadingId(nextHeadingId);
  }

  function navigateToHeading(heading: DocumentHeading) {
    setActiveHeadingId(heading.id);

    if (editorMode === "edit") {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const lineEnd = content.indexOf("\n", heading.start);
      textarea.focus();
      textarea.setSelectionRange(heading.start, lineEnd === -1 ? content.length : lineEnd);
      const lineNumber = content.slice(0, heading.start).split("\n").length - 1;
      textarea.scrollTop = Math.max(0, lineNumber * 28 - 84);
      return;
    }

    const container = canvasScrollRef.current;
    const target = document.getElementById(heading.id);
    if (!container || !target) return;

    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";

    if (container.scrollHeight > container.clientHeight) {
      const top = target.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop - 72;
      container.scrollTo({ behavior, top: Math.max(0, top) });
      return;
    }

    window.scrollTo({ behavior, top: Math.max(0, target.getBoundingClientRect().top + window.scrollY - 72) });
  }

  const isDirty = selectedTab?.item.kind === "note" && content !== savedContent;
  const selectedTitle = selected ? (selected.kind === "note" ? noteTitle(selected) : selected.name) : "";
  const isHorizontalDock = panelPosition === "top" || panelPosition === "bottom";
  const hoverPreviewContent = hoverPreview ? hoverPreviewContentByPath[hoverPreview.item.path] : undefined;
  const visiblePanes = visiblePaneCount(paneTabs);
  const visiblePaneSlots = paneSlots.filter((slot) => paneTabs[slot]);
  const groupedTabs = visiblePanes > 1
    ? tabs.filter((tab) => paneForPath(paneTabs, tab.item.path) !== null)
    : [];
  const standaloneTabs = visiblePanes > 1
    ? tabs.filter((tab) => paneForPath(paneTabs, tab.item.path) === null)
    : tabs;
  const firstGroupedTabIndex = visiblePanes > 1
    ? tabs.findIndex((tab) => paneForPath(paneTabs, tab.item.path) !== null)
    : -1;
  const standaloneTabsBeforeGroup = firstGroupedTabIndex < 0
    ? standaloneTabs
    : tabs.slice(0, firstGroupedTabIndex).filter((tab) => paneForPath(paneTabs, tab.item.path) === null);
  const standaloneTabsAfterGroup = firstGroupedTabIndex < 0
    ? []
    : tabs.slice(firstGroupedTabIndex).filter((tab) => paneForPath(paneTabs, tab.item.path) === null);
  const visibleEditorMode: EditorMode = visiblePanes > 1 && editorMode === "split" ? "edit" : editorMode;
  const splitAxis: PaneSplitAxis | null = visiblePanes === 2
    ? (visiblePaneSlots.every((slot) => slot === "topLeft" || slot === "topRight")
      || visiblePaneSlots.every((slot) => slot === "bottomLeft" || slot === "bottomRight")
      ? "horizontal"
      : visiblePaneSlots.every((slot) => slot === "topLeft" || slot === "bottomLeft")
        || visiblePaneSlots.every((slot) => slot === "topRight" || slot === "bottomRight")
        ? "vertical"
        : null)
    : null;
  const showDocumentOutline = visiblePanes === 1 && documentHeadings.length > 0 && editorMode !== "split";
  const graphRefreshKey = items
    .filter((item) => item.kind === "note")
    .map((item) => `${item.path}:${item.size}:${item.updatedAt}`)
    .join("|");

  function panelSizeBounds(horizontal: boolean) {
    const shellRect = panelRef.current?.parentElement?.getBoundingClientRect();
    const minimum = horizontal ? PANEL_HORIZONTAL_MIN_SIZE : PANEL_SIDE_MIN_SIZE;
    const hardMaximum = horizontal ? PANEL_HORIZONTAL_MAX_SIZE : PANEL_SIDE_MAX_SIZE;
    const canvasMinimum = horizontal ? 280 : 320;
    const available = horizontal
      ? shellRect?.height ?? window.innerHeight
      : shellRect?.width ?? window.innerWidth;

    return {
      maximum: Math.max(minimum, Math.min(hardMaximum, available - canvasMinimum)),
      minimum,
    };
  }

  function updatePanelSize(nextSize: number) {
    const bounds = panelSizeBounds(isHorizontalDock);
    const clampedSize = Math.round(Math.min(bounds.maximum, Math.max(bounds.minimum, nextSize)));
    if (isHorizontalDock) setHorizontalPanelSize(clampedSize);
    else setSidePanelSize(clampedSize);
  }

  function beginPanelResize(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || panelPresentation !== "expanded") return;
    const panelRect = panelRef.current?.getBoundingClientRect();
    if (!panelRect) return;

    panelResizeSessionRef.current = {
      pointerId: event.pointerId,
      startCoordinate: isHorizontalDock ? event.clientY : event.clientX,
      startSize: isHorizontalDock ? panelRect.height : panelRect.width,
    };
    setIsPanelResizing(true);
    event.currentTarget.focus();
    panelResizeCleanupRef.current();

    function movePanel(pointerEvent: PointerEvent) {
      const session = panelResizeSessionRef.current;
      if (!session || session.pointerId !== pointerEvent.pointerId) return;
      const coordinate = isHorizontalDock ? pointerEvent.clientY : pointerEvent.clientX;
      const direction = panelPosition === "left" || panelPosition === "top" ? 1 : -1;
      updatePanelSize(session.startSize + (coordinate - session.startCoordinate) * direction);
      pointerEvent.preventDefault();
    }

    function finishPanel(pointerEvent: PointerEvent) {
      const session = panelResizeSessionRef.current;
      if (!session || session.pointerId !== pointerEvent.pointerId) return;
      panelResizeSessionRef.current = null;
      setIsPanelResizing(false);
      panelResizeCleanupRef.current();
    }

    const cleanup = () => {
      window.removeEventListener("pointermove", movePanel);
      window.removeEventListener("pointerup", finishPanel);
      window.removeEventListener("pointercancel", finishPanel);
    };
    panelResizeCleanupRef.current = cleanup;
    window.addEventListener("pointermove", movePanel, { passive: false });
    window.addEventListener("pointerup", finishPanel);
    window.addEventListener("pointercancel", finishPanel);
    event.preventDefault();
  }

  function resizePanelWithKeyboard(event: React.KeyboardEvent<HTMLDivElement>) {
    const growKey = panelPosition === "left"
      ? "ArrowRight"
      : panelPosition === "right"
        ? "ArrowLeft"
        : panelPosition === "top"
          ? "ArrowDown"
          : "ArrowUp";
    const shrinkKey = panelPosition === "left"
      ? "ArrowLeft"
      : panelPosition === "right"
        ? "ArrowRight"
        : panelPosition === "top"
          ? "ArrowUp"
          : "ArrowDown";
    const bounds = panelSizeBounds(isHorizontalDock);
    const panelRect = panelRef.current?.getBoundingClientRect();
    const currentSize = isHorizontalDock
      ? panelRect?.height ?? horizontalPanelSize
      : panelRect?.width ?? sidePanelSize;

    if (event.key === growKey) updatePanelSize(currentSize + (event.shiftKey ? PANEL_RESIZE_STEP * 2 : PANEL_RESIZE_STEP));
    else if (event.key === shrinkKey) updatePanelSize(currentSize - (event.shiftKey ? PANEL_RESIZE_STEP * 2 : PANEL_RESIZE_STEP));
    else if (event.key === "Home") updatePanelSize(bounds.minimum);
    else if (event.key === "End") updatePanelSize(bounds.maximum);
    else return;

    event.preventDefault();
  }

  function paneRatioBounds(axis: PaneSplitAxis) {
    const rect = workspacePaneContainerRef.current?.getBoundingClientRect();
    const available = axis === "vertical" ? rect?.height ?? window.innerHeight : rect?.width ?? window.innerWidth;
    const minimum = Math.min(0.45, PANE_MIN_SIZE / Math.max(available, PANE_MIN_SIZE * 2));
    return { maximum: 1 - minimum, minimum };
  }

  function updatePaneSplitRatio(coordinate: number, axis: PaneSplitAxis) {
    const rect = workspacePaneContainerRef.current?.getBoundingClientRect();
    const available = axis === "vertical" ? rect?.height ?? 0 : rect?.width ?? 0;
    if (!rect || available <= 0) return;
    const bounds = paneRatioBounds(axis);
    const ratio = axis === "vertical"
      ? (coordinate - rect.top) / available
      : (coordinate - rect.left) / available;
    setPaneSplitRatio(Math.min(bounds.maximum, Math.max(bounds.minimum, ratio)));
  }

  function beginPaneResize(event: React.PointerEvent<HTMLDivElement>, axis: PaneSplitAxis) {
    if (event.button !== 0) return;
    paneResizeSessionRef.current = { pointerId: event.pointerId };
    setIsPaneResizing(true);
    event.currentTarget.focus();
    paneResizeCleanupRef.current();

    function movePaneDivider(pointerEvent: PointerEvent) {
      const session = paneResizeSessionRef.current;
      if (!session || session.pointerId !== pointerEvent.pointerId) return;
      updatePaneSplitRatio(axis === "vertical" ? pointerEvent.clientY : pointerEvent.clientX, axis);
      pointerEvent.preventDefault();
    }

    function finishPaneResize(pointerEvent: PointerEvent) {
      const session = paneResizeSessionRef.current;
      if (!session || session.pointerId !== pointerEvent.pointerId) return;
      paneResizeSessionRef.current = null;
      setIsPaneResizing(false);
      paneResizeCleanupRef.current();
    }

    const cleanup = () => {
      window.removeEventListener("pointermove", movePaneDivider);
      window.removeEventListener("pointerup", finishPaneResize);
      window.removeEventListener("pointercancel", finishPaneResize);
    };
    paneResizeCleanupRef.current = cleanup;
    window.addEventListener("pointermove", movePaneDivider, { passive: false });
    window.addEventListener("pointerup", finishPaneResize);
    window.addEventListener("pointercancel", finishPaneResize);
    event.preventDefault();
  }

  function resizePanesWithKeyboard(event: React.KeyboardEvent<HTMLDivElement>, axis: PaneSplitAxis) {
    const bounds = paneRatioBounds(axis);
    let nextRatio = paneSplitRatio;
    const decreaseKey = axis === "vertical" ? "ArrowUp" : "ArrowLeft";
    const increaseKey = axis === "vertical" ? "ArrowDown" : "ArrowRight";

    if (event.key === decreaseKey) nextRatio -= event.shiftKey ? PANE_RESIZE_STEP * 2 : PANE_RESIZE_STEP;
    else if (event.key === increaseKey) nextRatio += event.shiftKey ? PANE_RESIZE_STEP * 2 : PANE_RESIZE_STEP;
    else if (event.key === "Home") nextRatio = bounds.minimum;
    else if (event.key === "End") nextRatio = bounds.maximum;
    else return;

    setPaneSplitRatio(Math.min(bounds.maximum, Math.max(bounds.minimum, nextRatio)));
    event.preventDefault();
  }

  const sidePanelTrack = panelPresentation === "hidden"
    ? "0px"
    : panelPresentation === "compact"
      ? "3.5rem"
      : `${sidePanelSize}px`;
  const horizontalPanelTrack = panelPresentation === "hidden"
    ? "0px"
    : panelPresentation === "compact"
      ? "3.5rem"
      : `${horizontalPanelSize}px`;
  const workspaceShellStyle: React.CSSProperties = panelPosition === "left"
    ? {
        gridTemplateAreas: '"panel canvas"',
        gridTemplateColumns: `${sidePanelTrack} minmax(0,1fr)`,
      }
    : panelPosition === "right"
      ? {
          gridTemplateAreas: '"canvas panel"',
          gridTemplateColumns: `minmax(0,1fr) ${sidePanelTrack}`,
        }
      : panelPosition === "top"
        ? {
            gridTemplateAreas: '"panel" "canvas"',
            gridTemplateRows: `${horizontalPanelTrack} minmax(0,1fr)`,
          }
        : {
            gridTemplateAreas: '"canvas" "panel"',
            gridTemplateRows: `minmax(0,1fr) ${horizontalPanelTrack}`,
          };
  const notificationViewportStyle: React.CSSProperties = panelPresentation === "hidden"
    ? { bottom: "1rem", left: "auto", right: "1rem" }
    : panelPosition === "right"
      ? {
          bottom: "1rem",
          left: "1rem",
          right: "auto",
          width: `min(24rem, calc(100vw - ${sidePanelTrack} - 2rem))`,
        }
      : panelPosition === "left"
        ? {
            bottom: "1rem",
            left: "auto",
            right: "1rem",
            width: `min(24rem, calc(100vw - ${sidePanelTrack} - 2rem))`,
          }
        : panelPosition === "bottom"
          ? { bottom: `calc(${horizontalPanelTrack} + 1rem)`, left: "auto", right: "1rem" }
          : { bottom: "1rem", left: "auto", right: "1rem" };
  const panelBorderClass = panelPresentation === "hidden" ? "" : {
    bottom: "border-t",
    left: "border-r",
    right: "border-l",
    top: "border-b",
  }[panelPosition];
  const multiPaneGridAreas = visiblePanes === 3
    ? !paneTabs.topLeft
      ? '"topRight topRight" "bottomLeft bottomRight"'
      : !paneTabs.topRight
        ? '"topLeft topLeft" "bottomLeft bottomRight"'
        : !paneTabs.bottomLeft
          ? '"topLeft topRight" "bottomRight bottomRight"'
          : '"topLeft topRight" "bottomLeft bottomLeft"'
    : '"topLeft topRight" "bottomLeft bottomRight"';
  const paneGridStyle: React.CSSProperties | undefined = splitAxis === "horizontal"
    ? {
        gridTemplateAreas: visiblePaneSlots.includes("topLeft") && visiblePaneSlots.includes("topRight")
          ? '"topLeft divider topRight"'
          : '"bottomLeft divider bottomRight"',
        gridTemplateColumns: `minmax(0, ${paneSplitRatio}fr) 5px minmax(0, ${1 - paneSplitRatio}fr)`,
      }
    : splitAxis === "vertical"
      ? {
          gridTemplateAreas: visiblePaneSlots.includes("topLeft") && visiblePaneSlots.includes("bottomLeft")
            ? '"topLeft" "divider" "bottomLeft"'
            : '"topRight" "divider" "bottomRight"',
          gridTemplateRows: `minmax(0, ${paneSplitRatio}fr) 5px minmax(0, ${1 - paneSplitRatio}fr)`,
        }
      : visiblePanes > 1
        ? {
            gridTemplateAreas: multiPaneGridAreas,
            gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
            gridTemplateRows: "minmax(0, 1fr) minmax(0, 1fr)",
          }
        : undefined;

  const markdownEditorClassName = cn(
    "auto-hide-scrollbar min-h-[calc(100dvh-15rem)] resize-none rounded-none border-0 bg-transparent px-0 py-0 font-mono text-[15px] leading-7 shadow-none focus-visible:ring-0 md:min-h-[calc(100dvh-14rem)]",
    isHorizontalDock && "lg:min-h-[calc(100dvh-30rem)]",
  );
  const markdownEditor = (
    <Textarea
      aria-label="Редактор Markdown"
      className={markdownEditorClassName}
      onChange={(event) => {
        setContent(event.target.value);
        setFormattingHint(null);
      }}
      onKeyUp={() => {
        updateFormattingHint();
        updateActiveHeadingFromEditor();
      }}
      onScroll={(event) => {
        revealScrollbar(event.currentTarget);
        updateFormattingHint();
      }}
      onSelect={() => {
        updateFormattingHint();
        updateActiveHeadingFromEditor();
      }}
      ref={textareaRef}
      spellCheck
      value={content}
    />
  );

  function renderWorkspacePane(slot: PaneSlot, path: string) {
    const tab = tabs.find((candidate) => candidate.item.path === path);
    if (!tab) return null;

    const isActive = activePath === path;
    const title = tab.item.kind === "note" ? noteTitle(tab.item) : tab.item.name;
    const tabIsDirty = tab.item.kind === "note" && tab.content !== tab.savedContent;
    const paneEditorMode: EditorMode = visiblePanes > 1 && tab.editorMode === "split" ? "edit" : tab.editorMode;

    return (
      <section
        aria-label={`${paneLabels[slot]} панель: ${title}`}
        className={cn(
          "flex h-full w-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[var(--editor)]",
          isActive && visiblePanes > 1 && "ring-1 ring-inset ring-primary/35",
        )}
        data-workspace-dock-slot={slot}
        id={`workspace-pane-${slot}`}
        key={slot}
        onFocusCapture={() => {
          if (!isActive) focusPane(slot, path);
        }}
        onPointerDown={() => {
          if (!isActive) focusPane(slot, path);
        }}
        style={{ gridArea: slot }}
      >
        {visiblePanes > 1 ? (
          <header
            className={cn(
              "flex h-9 shrink-0 touch-none select-none items-center gap-2 border-b bg-background/55 px-3 text-xs cursor-grab transition-colors duration-150 active:cursor-grabbing motion-reduce:transition-none",
              draggedTabPath === path && "cursor-grabbing bg-primary/10",
            )}
            data-workspace-pane-drag-handle={path}
            onPointerDown={(event) => beginTabDrag(event, path)}
            title="Перетащите панель к нужному краю экрана"
          >
            {tab.item.kind === "note"
              ? <NoteIcon className="size-3.5 text-muted-foreground" motion="none" />
              : <AttachmentIcon className="size-3.5 text-muted-foreground" motion="none" />}
            <span className="min-w-0 flex-1 truncate font-medium">{title}</span>
            {tabIsDirty ? <span className="size-1.5 shrink-0 rounded-full bg-primary" title="Есть несохранённые изменения" /> : null}
            {visiblePanes > 1 ? (
              <button
                aria-label={`Убрать панель ${paneLabels[slot].toLowerCase()}`}
                className="grid size-7 place-items-center rounded-[4px] text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70"
                onClick={() => collapsePane(slot)}
                onPointerDown={(event) => event.stopPropagation()}
                title="Убрать разделение"
                type="button"
              >
                <CloseIcon className="size-3.5" motion="hover" />
              </button>
            ) : null}
          </header>
        ) : null}

        <div
          className={cn(
            "auto-hide-scrollbar min-h-0 flex-1 overflow-y-auto",
            visiblePanes > 1 ? "px-3 py-4 md:px-4" : "px-5 py-7 md:px-8 md:py-8",
          )}
          onScroll={(event) => {
            revealScrollbar(event.currentTarget);
            if (isActive && paneEditorMode !== "edit") updateActiveHeadingFromPreview();
          }}
          ref={isActive ? canvasScrollRef : undefined}
        >
          {tab.isLoading ? <LoadingCanvas /> : null}

          {!tab.isLoading && tab.item.kind === "note" && isActive ? (
            <div className={cn("relative mx-auto min-h-full", showDocumentOutline ? "max-w-5xl" : "max-w-3xl")}>
              <div className="mx-auto flex min-h-full max-w-3xl flex-col">
                {paneEditorMode === "edit" ? markdownEditor : null}
                {paneEditorMode === "preview" ? <MarkdownPreview content={tab.content} /> : null}
                {paneEditorMode === "split" ? (
                  <div className={cn(
                    "grid gap-6",
                    visiblePanes === 1 && "lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.85fr)] lg:gap-8",
                  )}>
                    <div className="min-w-0">{markdownEditor}</div>
                    <aside aria-label="Быстрый просмотр Markdown" className={cn(
                      "min-w-0 border-t pt-6",
                      visiblePanes === 1 && "lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0",
                    )}>
                      <div className="flex items-center justify-between gap-3">
                        <h2 className="text-sm font-semibold tracking-[-0.01em]">Быстрый просмотр</h2>
                        <kbd className="rounded-[4px] border bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">⌘/Ctrl H</kbd>
                      </div>
                      <div className="mt-5"><MarkdownPreview content={tab.content} /></div>
                    </aside>
                  </div>
                ) : null}
                <footer className="mt-auto flex items-center gap-3 border-t pt-4 text-xs text-muted-foreground">
                  <span>{wordCount(tab.content)} слов</span>
                  <span aria-hidden="true">·</span>
                  <span>{tabIsDirty ? "Есть несохранённые изменения" : "Все изменения сохранены"}</span>
                </footer>
              </div>

              {showDocumentOutline ? (
                <DocumentOutline
                  activeHeadingId={currentHeadingId}
                  headings={documentHeadings}
                  onNavigate={navigateToHeading}
                />
              ) : null}
            </div>
          ) : null}

          {!tab.isLoading && tab.item.kind === "note" && !isActive ? (
            <div className="mx-auto max-w-3xl">
              {paneEditorMode === "preview" ? (
                <MarkdownPreview content={tab.content} headingPrefix={`pane-${slot}-heading`} />
              ) : (
                <Textarea
                  aria-label={`Редактор Markdown: ${title}`}
                  className={markdownEditorClassName}
                  readOnly
                  spellCheck={false}
                  value={tab.content}
                />
              )}
            </div>
          ) : null}

          {!tab.isLoading && tab.item.kind === "attachment" ? (
            <div className="mx-auto flex max-w-xl flex-col items-start pt-8">
              <span className="grid size-11 place-items-center rounded-lg bg-secondary text-secondary-foreground">
                <AttachmentIcon className="size-5" motion="none" />
              </span>
              <span className="mt-5 text-xs font-medium text-muted-foreground">Вложение</span>
              <h2 className="mt-2 break-words text-xl font-semibold tracking-[-0.02em]">{tab.item.name}</h2>
              <p className="mt-3 text-sm text-muted-foreground">{tab.item.mimeType} · {formatBytes(tab.item.size)} · добавлен {formatDate(tab.item.updatedAt)}</p>
              <Button asChild className="mt-6 rounded-md shadow-none">
                <a href={`/api/vault/file?path=${encodeURIComponent(tab.item.path)}`} rel="noreferrer" target="_blank">
                  <ExternalLinkIcon className="size-4" motion="hover" />
                  Открыть файл
                </a>
              </Button>
            </div>
          ) : null}
        </div>
      </section>
    );
  }

  function openTabContextMenu(path: string, target: HTMLElement, clientX = 0, clientY = 0) {
    const bounds = target.getBoundingClientRect();
    setTabContextMenu({
      path,
      x: clientX || bounds.left + bounds.width / 2,
      y: clientY || bounds.bottom,
    });
  }

  function renderWorkspaceTab(tab: WorkspaceTab, isGrouped = false) {
    const path = tab.item.path;
    const isActive = activePath === path && workspaceView === "document";
    const tabIsDirty = tab.item.kind === "note" && tab.content !== tab.savedContent;
    const title = tab.item.kind === "note" ? noteTitle(tab.item) : tab.item.name;

    return (
      <motion.div
        animate={{ opacity: 1, scale: 1, x: 0 }}
        className={cn(
          "group/tab relative flex min-w-28 max-w-52 items-center overflow-hidden rounded-md text-muted-foreground transition-[background-color,color,opacity] duration-150 hover:bg-background/50 hover:text-foreground motion-reduce:transition-none",
          isGrouped ? "h-8 bg-background/10" : "h-9",
          isActive && "text-foreground",
          draggedTabPath === path && "opacity-45",
        )}
        data-workspace-tab-drop-path={path}
        exit={prefersReducedMotion ? undefined : { opacity: 0, scale: 0.96, x: -6 }}
        initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.96, x: -6 }}
        key={path}
        layout={prefersReducedMotion ? false : "position"}
        onContextMenu={isGrouped ? (event) => {
          event.preventDefault();
          event.stopPropagation();
          openTabContextMenu(path, event.currentTarget, event.clientX, event.clientY);
        } : undefined}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      >
        {tabDropIndicator?.targetPath === path && tabDropIndicator.position !== "end" ? (
          <motion.span
            animate={{ opacity: 1, scaleY: 1 }}
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-1 left-0 z-30 w-0.5 rounded-full bg-primary ring-2 ring-background"
            data-workspace-tab-drop-indicator
            initial={prefersReducedMotion ? false : { opacity: 0, scaleY: 0.55 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.12, ease: [0.16, 1, 0.3, 1] }}
          />
        ) : null}
        {isActive ? (
          prefersReducedMotion ? (
            <span aria-hidden="true" className="absolute inset-0 rounded-md bg-[var(--editor)] shadow-sm ring-1 ring-border/70" />
          ) : (
            <motion.span
              aria-hidden="true"
              className="absolute inset-0 rounded-md bg-[var(--editor)] shadow-sm ring-1 ring-border/70"
              layoutId="workspace-active-tab"
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            />
          )
        ) : null}
        <button
          aria-controls={`workspace-pane-${paneForPath(paneTabs, path) ?? focusedPane}`}
          aria-haspopup={isGrouped ? "menu" : undefined}
          aria-selected={isActive}
          className="relative z-10 flex min-w-0 flex-1 cursor-grab items-center gap-2 self-stretch rounded-md pl-2.5 pr-1 text-left text-xs font-medium outline-none transition-colors duration-150 active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70 motion-reduce:transition-none"
          data-workspace-tab-path={path}
          onClick={() => activateTab(path)}
          onKeyDown={isGrouped ? (event) => {
            if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
            event.preventDefault();
            event.stopPropagation();
            openTabContextMenu(path, event.currentTarget);
          } : undefined}
          onPointerDown={(event) => beginTabDrag(event, path)}
          role="tab"
          title={isGrouped
            ? `${path} — перетащите на полосу вкладок, чтобы убрать из разделения · ПКМ или Shift+F10 — действия`
            : `${path} — перетащите на левый, правый, верхний или нижний край документа`}
          type="button"
        >
          {tab.item.kind === "note"
            ? <NoteIcon className={cn("size-3.5 shrink-0 transition-colors duration-150", isActive && "text-primary")} />
            : <AttachmentIcon className={cn("size-3.5 shrink-0 transition-colors duration-150", isActive && "text-primary")} />}
          <span className="truncate">{title}</span>
          {tabIsDirty ? <span aria-label="Есть несохранённые изменения" className="size-1.5 shrink-0 rounded-full bg-primary" /> : null}
        </button>
        <button
          aria-label={`Закрыть ${title}`}
          className={cn(
            "relative z-10 mr-0.5 grid size-8 shrink-0 place-items-center rounded-md opacity-0 outline-none transition-[background-color,opacity] duration-150 hover:bg-muted hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/70 motion-reduce:transition-none group-hover/tab:opacity-70",
            isActive && "opacity-55",
          )}
          draggable={false}
          onClick={() => closeTab(path)}
          title={`Закрыть ${title}`}
          type="button"
        >
          <CloseIcon className="size-3.5" motion="hover" />
        </button>
      </motion.div>
    );
  }

  return (
    <>
      <main className="h-[100dvh] overflow-hidden bg-background text-foreground selection:bg-[var(--selection)]">
      <div
        className={cn(
          "vault-workspace-shell grid h-full min-h-0",
          !isPanelResizing && "transition-[grid-template-columns,grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
          isPanelResizing && "select-none",
        )}
        data-panel-position={panelPosition}
        data-panel-presentation={panelPresentation}
        data-panel-resizing={isPanelResizing || undefined}
        style={workspaceShellStyle}
      >
        <section
          aria-label="Рабочее полотно"
          className="grid h-full min-h-0 min-w-0 grid-rows-[auto_auto_minmax(0,1fr)] bg-[var(--editor)]"
          style={{ gridArea: "canvas" }}
        >
          <nav
            aria-label="Открытые файлы"
            className="row-start-1 z-20 flex h-12 shrink-0 min-w-0 items-end border-b bg-muted/45 px-2.5 pb-1"
            data-workspace-tab-strip
          >
            <div
              className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              data-workspace-tab-scroll
              ref={tabStripScrollRef}
            >
              <div className="flex w-full min-w-max items-end gap-2 pt-2" role="tablist">
                <AnimatePresence initial={false}>
                  {standaloneTabsBeforeGroup.map((tab) => renderWorkspaceTab(tab))}
                </AnimatePresence>

                {groupedTabs.length > 0 ? (
                  <motion.div
                    animate={{ opacity: 1, y: 0 }}
                    aria-label="Вкладки разделённого экрана"
                    className="workspace-tab-group relative mx-2 flex h-9 shrink-0 items-end px-1"
                    data-workspace-tab-group
                    initial={prefersReducedMotion ? false : { opacity: 0, y: -2 }}
                    role="group"
                    transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <span aria-hidden="true" className="workspace-tab-group-shelf absolute inset-x-0 bottom-0 h-9" />
                    <div className="relative z-10 flex h-9 min-h-0 items-center gap-0.5">
                      <AnimatePresence initial={false}>
                        {groupedTabs.map((tab) => renderWorkspaceTab(tab, true))}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                ) : null}

                <AnimatePresence initial={false}>
                  {standaloneTabsAfterGroup.map((tab) => renderWorkspaceTab(tab))}
                </AnimatePresence>

                {tabs.length === 0 ? (
                  <p className="flex h-9 items-center px-3 text-xs text-muted-foreground">Откройте файл из Vault</p>
                ) : null}

                <span
                  aria-hidden="true"
                  className="relative h-9 min-w-16 flex-1"
                  data-workspace-tab-strip-dropzone
                >
                  {tabDropIndicator?.position === "end" ? (
                    <motion.span
                      animate={{ opacity: 1, scaleY: 1 }}
                      className="pointer-events-none absolute inset-y-1 left-0 z-30 w-0.5 rounded-full bg-primary ring-2 ring-background"
                      data-workspace-tab-drop-indicator
                      initial={prefersReducedMotion ? false : { opacity: 0, scaleY: 0.55 }}
                      transition={{ duration: prefersReducedMotion ? 0 : 0.12, ease: [0.16, 1, 0.3, 1] }}
                    />
                  ) : null}
                </span>
              </div>
            </div>
          </nav>

          <header className="row-start-2 flex h-16 shrink-0 min-w-0 items-center justify-between gap-2 border-b bg-[var(--editor)] px-3 py-2.5 md:px-6 min-[1101px]:gap-4">
            <div className="min-w-0 flex-1">
              {workspaceView === "brain" ? (
                <>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <GraphIcon className="size-3.5" />
                    <span>Связи Markdown · {formatRussianCount(items.filter((item) => item.kind === "note").length, ["заметка", "заметки", "заметок"])}</span>
                  </div>
                  <h1 className="mt-1 truncate text-lg font-semibold tracking-[-0.02em] md:text-xl">Атлас</h1>
                </>
              ) : selected ? (
                <>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {selected.kind === "note" ? <NoteIcon className="size-3.5" /> : <AttachmentIcon className="size-3.5" />}
                    <span className="truncate">{selected.path}</span>
                  </div>
                  <h1 className="mt-1 truncate text-lg font-semibold tracking-[-0.02em] md:text-xl">{selectedTitle}</h1>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Выберите файл в панели Vault</p>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-1.5 min-[1101px]:gap-2">
              {workspaceView === "document" && selected?.kind === "note" ? (
                <>
                <div aria-label="Режим документа" className="hidden rounded-md bg-muted p-1 min-[1101px]:flex" role="tablist">
                  <button
                    aria-selected={visibleEditorMode === "edit"}
                    className={cn("h-7 rounded-[5px] px-2.5 text-xs font-medium text-muted-foreground outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring/70", visibleEditorMode === "edit" && "bg-background text-foreground shadow-sm")}
                    onClick={() => setEditorMode("edit")}
                    role="tab"
                    type="button"
                  >
                    Редактор
                  </button>
                  {visiblePanes === 1 ? (
                    <button
                      aria-selected={visibleEditorMode === "split"}
                      className={cn("h-7 rounded-[5px] px-2.5 text-xs font-medium text-muted-foreground outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring/70", visibleEditorMode === "split" && "bg-background text-foreground shadow-sm")}
                      onClick={() => {
                        setFormattingHint(null);
                        setEditorMode("split");
                      }}
                      role="tab"
                      type="button"
                    >
                      Рядом
                    </button>
                  ) : null}
                  <button
                    aria-selected={visibleEditorMode === "preview"}
                    className={cn("h-7 rounded-[5px] px-2.5 text-xs font-medium text-muted-foreground outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring/70", visibleEditorMode === "preview" && "bg-background text-foreground shadow-sm")}
                    onClick={() => setEditorMode("preview")}
                    role="tab"
                    type="button"
                  >
                    Просмотр
                  </button>
                </div>
                <button
                  aria-label={visibleEditorMode === "edit" ? "Открыть просмотр Markdown" : "Открыть редактор Markdown"}
                  className="hidden size-8 place-items-center rounded-md bg-muted text-muted-foreground outline-none transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70 max-[1100px]:inline-grid"
                  onClick={() => setEditorMode((mode) => (mode === "edit" ? "preview" : "edit"))}
                  title={visibleEditorMode === "edit" ? "Открыть просмотр Markdown" : "Открыть редактор Markdown"}
                  type="button"
                >
                  {visibleEditorMode === "edit"
                    ? <PreviewIcon className="size-3.5" motion="hover" />
                    : <EditIcon className="size-3.5" motion="hover" />}
                </button>
                <Button
                  aria-label={isSaving ? "Сохранение…" : isDirty ? "Сохранить" : "Сохранено"}
                  className="h-8 w-8 rounded-md px-0 shadow-none min-[1101px]:h-9 min-[1101px]:w-auto min-[1101px]:px-3"
                  disabled={!isDirty || isSaving}
                  onClick={() => void saveNote()}
                  size="sm"
                  title={isSaving ? "Сохранение…" : isDirty ? "Сохранить" : "Сохранено"}
                  type="button"
                  variant={isDirty || isSaving ? "default" : "secondary"}
                >
                  {isSaving ? (
                    <LoadingIcon className="size-3.5" motion="loop" />
                  ) : isDirty ? (
                    <EditIcon className="size-3.5" />
                  ) : (
                    <CheckIcon className="size-3.5" motion="none" />
                  )}
                  <span className="max-[1100px]:sr-only">{isSaving ? "Сохранение…" : isDirty ? "Сохранить" : "Сохранено"}</span>
                </Button>
                </>
              ) : null}

              <div aria-label="Вид рабочего пространства" className="flex rounded-md bg-muted p-1" role="tablist">
                <button
                  aria-selected={workspaceView === "document"}
                  className={cn(
                    "inline-flex h-7 items-center justify-center gap-1.5 rounded-[5px] px-2 text-xs font-medium text-muted-foreground outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring/70 min-[1101px]:px-2.5",
                    workspaceView === "document" && "bg-background text-foreground shadow-sm",
                  )}
                  onClick={() => setWorkspaceView("document")}
                  role="tab"
                  type="button"
                >
                  <NoteIcon className="hidden size-3.5 max-[1100px]:block" />
                  <span className="max-[1100px]:sr-only">Документ</span>
                </button>
                <button
                  aria-selected={workspaceView === "brain"}
                  className={cn(
                    "flex h-7 items-center gap-1.5 rounded-[5px] px-2 text-xs font-medium text-muted-foreground outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring/70 min-[1101px]:px-2.5",
                    workspaceView === "brain" && "bg-background text-foreground shadow-sm",
                  )}
                  onClick={() => {
                    setFormattingHint(null);
                    setWorkspaceView("brain");
                  }}
                  role="tab"
                  type="button"
                >
                  <GraphIcon className="size-3.5" />
                  <span className="max-[1100px]:sr-only">Атлас</span>
                </button>
              </div>
            </div>
          </header>

          <div className="row-start-3 min-h-0 overflow-hidden">
            {workspaceView === "brain" ? (
              <BrainGraph
                activeFolder={activeFolder}
                onFolderChange={(folder) => {
                  setGraphFolder(folder);
                  revealFolder(folder);
                }}
                onOpenNote={(path) => {
                  const item = items.find((candidate) => candidate.kind === "note" && candidate.path === path);
                  if (!item) return;
                  setGraphFolder(parentFolder(item.path));
                  revealFolder(parentFolder(item.path));
                  void openItem(item);
                }}
                refreshKey={graphRefreshKey}
                selectedPath={selected?.kind === "note" ? selected.path : null}
                theme={theme}
              />
            ) : tabs.length > 0 ? (
              <div
                className={cn(
                  "relative h-full min-h-0 overflow-hidden",
                  visiblePanes > 1 ? "grid bg-border" : "flex",
                  isPaneResizing && "select-none",
                )}
                data-workspace-split={splitAxis ?? undefined}
                ref={workspacePaneContainerRef}
                style={paneGridStyle}
              >
                {visiblePaneSlots.map((slot) => {
                  const path = paneTabs[slot];
                  return path ? renderWorkspacePane(slot, path) : null;
                })}
                {splitAxis ? (
                  <div
                    aria-label={splitAxis === "horizontal" ? "Изменить ширину областей документов" : "Изменить высоту областей документов"}
                    aria-orientation={splitAxis === "horizontal" ? "vertical" : "horizontal"}
                    aria-valuemax={80}
                    aria-valuemin={20}
                    aria-valuenow={Math.round(paneSplitRatio * 100)}
                    className={cn(
                      "group relative z-20 flex touch-none items-stretch justify-center outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70",
                      splitAxis === "horizontal" ? "h-full cursor-col-resize" : "w-full cursor-row-resize",
                    )}
                    data-workspace-pane-divider
                    onDoubleClick={() => setPaneSplitRatio(0.5)}
                    onKeyDown={(event) => resizePanesWithKeyboard(event, splitAxis)}
                    onPointerDown={(event) => beginPaneResize(event, splitAxis)}
                    role="separator"
                    style={{ gridArea: "divider" }}
                    tabIndex={0}
                    title={splitAxis === "horizontal"
                      ? "Перетащите, чтобы изменить ширину · двойной клик — поровну"
                      : "Перетащите, чтобы изменить высоту · двойной клик — поровну"}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "absolute pointer-events-auto",
                        splitAxis === "horizontal" ? "-inset-x-1.5 inset-y-0" : "inset-x-0 -inset-y-1.5",
                      )}
                      data-workspace-pane-divider-hit-area
                    />
                    <span
                      aria-hidden="true"
                      className={cn(
                        "bg-border transition-[background-color,width,height] duration-150 group-hover:bg-primary/70 group-focus-visible:bg-primary/70 motion-reduce:transition-none",
                        splitAxis === "horizontal" ? "h-full w-px group-hover:w-0.5 group-focus-visible:w-0.5" : "h-px w-full group-hover:h-0.5 group-focus-visible:h-0.5",
                        isPaneResizing && (splitAxis === "horizontal" ? "w-0.5 bg-primary" : "h-0.5 bg-primary"),
                      )}
                    />
                  </div>
                ) : null}

                {draggedTabPath && tabs.length >= 2 ? (
                  <div
                    aria-label="Области размещения вкладки"
                    className="absolute inset-0 z-40 grid cursor-grabbing grid-cols-2 grid-rows-[0.72fr_1fr_0.72fr] gap-2 bg-background/18 p-2 backdrop-blur-[1px]"
                    data-workspace-dock-overlay
                  >
                    {(["top", "left", "right", "bottom"] as const).map((target) => {
                      const isTargeted = dockTarget === target;
                      const DockIcon = dockOptions.find((option) => option.value === target)?.Icon ?? DockLeftIcon;
                      return (
                        <div
                          aria-label={`Открыть вкладку ${dockTargetLabels[target]}`}
                          className={cn(
                            "flex items-center justify-center gap-2 rounded-md border border-dashed text-xs font-medium transition-[background-color,border-color,color,box-shadow] duration-150 motion-reduce:transition-none",
                            (target === "top" || target === "bottom") && "col-span-2",
                            isTargeted
                              ? "border-primary/80 bg-primary/10 text-foreground shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--primary)_28%,transparent)]"
                              : "border-border/75 bg-background/45 text-muted-foreground",
                          )}
                          data-workspace-dock-target={target}
                          key={target}
                        >
                          <DockIcon className="size-4" motion="none" />
                          <span className="hidden sm:inline">Открыть {dockTargetLabels[target]}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
                <span aria-live="polite" className="sr-only">
                  {draggedTabPath ? "Выберите сторону экрана и отпустите вкладку" : ""}
                </span>
              </div>
            ) : (
              <div className="mx-auto flex h-full max-w-md flex-col items-start px-6 pt-16">
                <span className="grid size-11 place-items-center rounded-lg bg-accent text-accent-foreground">
                  <FolderOpenIcon className="size-5" />
                </span>
                <h2 className="mt-5 text-xl font-semibold tracking-[-0.02em]">Раскройте папку и выберите файл</h2>
                <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">Файлы открываются во вкладках сверху. Одновременно можно держать до {MAX_WORKSPACE_TABS} вкладок.</p>
              </div>
            )}
          </div>
        </section>

        <aside
          aria-label="Панель Vault"
          className={cn(
            "vault-workspace-panel relative flex min-h-0 min-w-0 flex-col bg-sidebar transition-[opacity] duration-150",
            panelPresentation === "hidden" ? "overflow-visible" : "overflow-hidden",
            panelBorderClass,
          )}
          data-panel-position={panelPosition}
          data-panel-closing={isPanelClosing || undefined}
          data-panel-presentation={panelPresentation}
          id="vault-panel"
          ref={panelRef}
          style={{ gridArea: "panel" }}
        >
          {panelPresentation === "expanded" ? (
            <div
              aria-controls="vault-panel"
              aria-label="Изменить размер панели Vault"
              aria-orientation={isHorizontalDock ? "horizontal" : "vertical"}
              aria-valuemax={isHorizontalDock ? PANEL_HORIZONTAL_MAX_SIZE : PANEL_SIDE_MAX_SIZE}
              aria-valuemin={isHorizontalDock ? PANEL_HORIZONTAL_MIN_SIZE : PANEL_SIDE_MIN_SIZE}
              aria-valuenow={isHorizontalDock ? horizontalPanelSize : sidePanelSize}
              className={cn(
                "group/resizer absolute z-40 touch-none outline-none",
                (panelPosition === "left" || panelPosition === "right") && "inset-y-0 w-2 cursor-col-resize",
                panelPosition === "left" && "right-0",
                panelPosition === "right" && "left-0",
                (panelPosition === "top" || panelPosition === "bottom") && "inset-x-0 h-2 cursor-row-resize",
                panelPosition === "top" && "bottom-0",
                panelPosition === "bottom" && "top-0",
              )}
              onDoubleClick={() => updatePanelSize(isHorizontalDock ? PANEL_HORIZONTAL_DEFAULT_SIZE : PANEL_SIDE_DEFAULT_SIZE)}
              onKeyDown={resizePanelWithKeyboard}
              onPointerDown={beginPanelResize}
              role="separator"
              tabIndex={0}
              title="Потяните, чтобы изменить размер · двойной клик — сбросить"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "absolute bg-border transition-[background-color,transform] duration-150 group-hover/resizer:bg-primary group-focus-visible/resizer:bg-primary",
                  (panelPosition === "left" || panelPosition === "right") && "inset-y-0 w-px group-hover/resizer:scale-x-[2] group-focus-visible/resizer:scale-x-[2]",
                  panelPosition === "left" && "right-0",
                  panelPosition === "right" && "left-0",
                  (panelPosition === "top" || panelPosition === "bottom") && "inset-x-0 h-px group-hover/resizer:scale-y-[2] group-focus-visible/resizer:scale-y-[2]",
                  panelPosition === "top" && "bottom-0",
                  panelPosition === "bottom" && "top-0",
                )}
              />
            </div>
          ) : null}
          <input ref={fileInputRef} className="sr-only" type="file" onChange={uploadFile} />
          <VaultLibrary
            busyPaths={[
              ...busyLibraryPaths,
              ...savingPaths,
              ...tabs.filter((tab) => tab.isLoading).map((tab) => tab.item.path),
              ...(isCreating ? ["__create__"] : []),
              ...(isUploading ? ["__upload__"] : []),
            ]}
            className={panelPresentation === "hidden"
              ? cn(
                  "fixed z-30",
                  panelPosition === "left" && "left-0 top-1/2 -translate-y-1/2",
                  panelPosition === "right" && "right-0 top-1/2 -translate-y-1/2",
                  panelPosition === "top" && "left-1/2 top-0 -translate-x-1/2",
                  panelPosition === "bottom" && "bottom-0 left-1/2 -translate-x-1/2",
                )
              : "h-full"}
            edge={panelPosition === "right" ? "right" : "left"}
            expandedFolders={expandedFolders}
            folders={folders.map((folder) => folder.path)}
            isLoading={isLoading}
            items={items}
            onCreateFolder={createLibraryFolder}
            onCreateNote={createLibraryNote}
            onDelete={deleteLibraryTarget}
            onExpandedFoldersChange={setExpandedFolders}
            onImport={openImportPicker}
            onMove={moveLibraryTarget}
            onOpenItem={(item) => {
              cancelHoverPreviewDismissal();
              setHoverPreview(null);
              void openItem(item);
            }}
            onOrderChange={setLibraryOrder}
            onPresentationChange={changePanelPresentation}
            onPreviewEnd={scheduleHoverPreviewDismissal}
            onPreviewItem={showHoverPreview}
            onRename={renameLibraryTarget}
            onSearch={searchVault}
            onViewChange={setLibraryView}
            openPaths={tabs.map((tab) => tab.item.path)}
            order={libraryOrder}
            orientation={isHorizontalDock ? "horizontal" : "vertical"}
            presentation={panelPresentation}
            selectedPath={selected?.path}
            settings={(
              <PanelSettings
                onHide={() => changePanelPresentation("hidden")}
                onOpenSettings={() => setIsSettingsOpen(true)}
                onPositionChange={setPanelPosition}
                position={panelPosition}
              />
            )}
            view={libraryView}
          />
        </aside>
      </div>

      <NotificationViewport style={notificationViewportStyle} />
      <SettingsDialog onOpenChange={setIsSettingsOpen} open={isSettingsOpen} />
      </main>

      <DropdownMenu
        modal={false}
        onOpenChange={(open) => {
          if (!open) setTabContextMenu(null);
        }}
        open={tabContextMenu !== null}
      >
        <DropdownMenuTrigger asChild>
          <span
            aria-hidden="true"
            className="pointer-events-none fixed size-px opacity-0"
            style={{ left: tabContextMenu?.x ?? 0, top: tabContextMenu?.y ?? 0 }}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52 rounded-lg" side="right" sideOffset={2}>
          <DropdownMenuLabel className="truncate">
            {tabs.find((tab) => tab.item.path === tabContextMenu?.path)?.item.name ?? "Вкладка"}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              if (tabContextMenu) undockTab(tabContextMenu.path);
            }}
          >
            Убрать из разделения
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {formattingHint && typeof document !== "undefined" ? createPortal(
        <div
          aria-label="Форматирование выделенного текста"
          className="fixed z-50 flex h-9 items-center gap-0.5 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
          role="toolbar"
          style={{ left: formattingHint.left, top: formattingHint.top }}
        >
          <span className="px-1.5 text-xs font-medium text-muted-foreground">Форматировать</span>
          <span aria-hidden="true" className="h-4 w-px bg-border" />
          {formatOptions.map(({ value, label, mark }) => (
            <button
              aria-label={label}
              className={cn(
                "grid size-7 place-items-center rounded-[4px] text-xs font-semibold text-muted-foreground outline-none transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/70",
                value === "italic" && "font-serif italic",
              )}
              key={value}
              onClick={() => applyFormatting(value)}
              onPointerDown={(event) => event.preventDefault()}
              title={label}
              type="button"
            >
              {mark}
            </button>
          ))}
        </div>,
        document.body,
      ) : null}

      {typeof document !== "undefined" ? createPortal(
        <AnimatePresence initial={false}>
          {hoverPreview ? (
            <motion.aside
              animate={prefersReducedMotion ? undefined : { opacity: 1, scale: 1, y: 0 }}
              aria-label={`Быстрый просмотр: ${noteTitle(hoverPreview.item)}`}
              className="fixed z-40 w-[calc(100vw-2rem)] max-w-[22rem] overflow-hidden rounded-xl border bg-popover p-3 text-popover-foreground shadow-lg"
              exit={prefersReducedMotion ? undefined : { opacity: 0, scale: 0.98, y: 3 }}
              initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.98, y: 3 }}
              key={hoverPreview.item.path}
              onPointerEnter={cancelHoverPreviewDismissal}
              onPointerLeave={scheduleHoverPreviewDismissal}
              style={{ left: hoverPreview.left, top: hoverPreview.top }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.14, ease: [0.16, 1, 0.3, 1] }}
            >
          <header className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">Быстрый просмотр</p>
              <h2 className="mt-0.5 truncate text-base font-semibold tracking-[-0.02em]">{noteTitle(hoverPreview.item)}</h2>
            </div>
            <span className="shrink-0 rounded-[4px] bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">Markdown</span>
          </header>

          <div className="mt-3 border-t pt-3">
            {hoverPreviewContent === undefined ? (
              <div aria-busy="true" className="space-y-2 py-0.5">
                <div className="h-3 w-11/12 animate-pulse rounded bg-muted" />
                <div className="h-3 w-full animate-pulse rounded bg-muted" />
                <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
              </div>
            ) : hoverPreviewContent === null ? (
              <p className="py-0.5 text-sm leading-5 text-muted-foreground">Не удалось загрузить содержимое заметки.</p>
            ) : (
              <p className="line-clamp-3 text-sm leading-5 text-muted-foreground">
                {markdownExcerpt(hoverPreviewContent) || "В этой заметке пока нет текста."}
              </p>
            )}
          </div>

          <footer className="mt-3 flex items-center justify-between gap-3 border-t pt-2.5 text-[11px] text-muted-foreground">
            <span>{formatDate(hoverPreview.item.updatedAt)}</span>
            <button
              className="font-medium text-foreground outline-none transition-colors duration-150 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/70"
              onClick={() => {
                cancelHoverPreviewDismissal();
                setHoverPreview(null);
                void openItem(hoverPreview.item);
              }}
              type="button"
            >
              Открыть заметку
            </button>
          </footer>
            </motion.aside>
          ) : null}
        </AnimatePresence>,
        document.body,
      ) : null}
    </>
  );
}

export { VaultWorkspace };
