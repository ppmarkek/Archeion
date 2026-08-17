"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { Button } from "@/components/ui/button";
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
  VaultLibrary,
  type VaultLibraryCreateInput,
  type VaultLibraryItem,
  type VaultLibraryMoveInput,
  type VaultLibraryPresentation,
  type VaultLibrarySearchResult,
  type VaultLibraryTarget,
} from "@/components/vault/vault-library";
import {
  AttachmentIcon,
  CheckIcon,
  CloseIcon,
  DockBottomIcon,
  DockLeftIcon,
  DockRightIcon,
  DockTopIcon,
  EditIcon,
  ExternalLinkIcon,
  FolderOpenIcon,
  GraphIcon,
  LoadingIcon,
  MonitorIcon,
  MoonIcon,
  NoteIcon,
  SunIcon,
} from "@/components/vault/vault-icons";
import type { AppIconProps } from "@/components/vault/vault-icons";
import { cn, formatRussianCount } from "@/lib/utils";

type VaultEntry = VaultLibraryItem;

type VaultFolderEntry = {
  path: string;
  name: string;
  kind: "folder";
  updatedAt: string;
};

type ApiError = {
  error?: unknown;
};

type EditorMode = "edit" | "split" | "preview";
type WorkspaceView = "document" | "brain";
type PanelPosition = "left" | "right" | "top" | "bottom";
type PaneSlot = "center" | PanelPosition;
type ThemePreference = "light" | "system" | "dark";
type TextFormat = "bold" | "italic" | "heading" | "list" | "quote" | "link";
type LibraryView = "tree" | "all";

type WorkspaceTab = {
  content: string;
  isLoading: boolean;
  item: VaultEntry;
  savedContent: string;
};

type PaneTabs = Record<PaneSlot, string | null>;

type StoredWorkspace = {
  activePath?: unknown;
  focusedPane?: unknown;
  openPaths?: unknown;
  panes?: unknown;
};

type StoredLibrary = {
  expandedFolders?: unknown;
  order?: unknown;
  view?: unknown;
};

type PathChange = {
  from: string;
  to: string;
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

type DocumentHeading = {
  id: string;
  level: number;
  start: number;
  text: string;
};

const MAX_OPEN_TABS = 8;
const MAX_VISIBLE_PANES = 4;
const WORKSPACE_STORAGE_KEY = "archeion-workspace-v1";
const PANEL_MODE_STORAGE_KEY = "archeion-panel-mode-v2";
const LEGACY_PANEL_COMPACT_STORAGE_KEY = "archeion-panel-compact";
const LIBRARY_STORAGE_KEY = "archeion-library-v1";
const paneSlots: PaneSlot[] = ["center", "left", "right", "top", "bottom"];
const emptyPaneTabs: PaneTabs = {
  bottom: null,
  center: null,
  left: null,
  right: null,
  top: null,
};

const themeOptions = [
  { value: "light", label: "Светлая тема", Icon: SunIcon },
  { value: "system", label: "Как в системе", Icon: MonitorIcon },
  { value: "dark", label: "Тёмная тема", Icon: MoonIcon },
] as const;

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

const splitOptions: Array<{
  value: PanelPosition;
  label: string;
  shortLabel: string;
  Icon: React.ComponentType<AppIconProps>;
}> = [
  { value: "left", label: "Разместить активную вкладку слева", shortLabel: "Слева", Icon: DockLeftIcon },
  { value: "right", label: "Разместить активную вкладку справа", shortLabel: "Справа", Icon: DockRightIcon },
  { value: "top", label: "Разместить активную вкладку сверху", shortLabel: "Сверху", Icon: DockTopIcon },
  { value: "bottom", label: "Разместить активную вкладку снизу", shortLabel: "Снизу", Icon: DockBottomIcon },
];

const paneLabels: Record<PaneSlot, string> = {
  bottom: "Снизу",
  center: "Основная",
  left: "Слева",
  right: "Справа",
  top: "Сверху",
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

function folderLabel(path: string) {
  if (!path) return "Корень";
  const name = path.split("/").at(-1) ?? path;
  return name === "attachments" ? "Вложения" : name;
}

function collectFolders(items: VaultEntry[]) {
  const folders = new Set<string>([""]);

  for (const item of items) {
    const parts = item.path.split("/");
    for (let index = 1; index < parts.length; index += 1) {
      folders.add(parts.slice(0, index).join("/"));
    }
  }

  return [...folders].sort((left, right) => {
    if (!left) return -1;
    if (!right) return 1;
    return left.localeCompare(right, "ru");
  });
}

function folderAncestors(folder: string) {
  const parts = folder.split("/").filter(Boolean);
  return parts.map((_, index) => parts.slice(0, index + 1).join("/"));
}

function remapPath(path: string, changes: readonly PathChange[]) {
  const orderedChanges = [...changes].sort((left, right) => right.from.length - left.from.length);
  const change = orderedChanges.find(({ from }) => path === from || path.startsWith(`${from}/`));
  if (!change) return path;
  return path === change.from ? change.to : `${change.to}${path.slice(change.from.length)}`;
}

function pathIsWithin(path: string, parent: string) {
  return path === parent || path.startsWith(`${parent}/`);
}

function paneForPath(panes: PaneTabs, path: string) {
  return paneSlots.find((slot) => panes[slot] === path) ?? null;
}

function visiblePaneCount(panes: PaneTabs) {
  return paneSlots.reduce((count, slot) => count + (panes[slot] ? 1 : 0), 0);
}

function isPaneSlot(value: unknown): value is PaneSlot {
  return value === "center" || value === "left" || value === "right" || value === "top" || value === "bottom";
}

function sanitiseStoredWorkspace(value: string | null, items: VaultEntry[]) {
  let stored: StoredWorkspace = {};
  try {
    stored = value ? JSON.parse(value) as StoredWorkspace : {};
  } catch {
    stored = {};
  }

  const itemPaths = new Set(items.map((item) => item.path));
  const openPaths = Array.isArray(stored.openPaths)
    ? stored.openPaths.filter((path): path is string => typeof path === "string" && itemPaths.has(path)).slice(0, MAX_OPEN_TABS)
    : [];

  if (openPaths.length === 0) {
    const firstNote = items.find((item) => item.kind === "note") ?? items[0];
    if (firstNote) openPaths.push(firstNote.path);
  }

  const panes: PaneTabs = { ...emptyPaneTabs };
  const storedPanes = stored.panes && typeof stored.panes === "object"
    ? stored.panes as Partial<Record<PaneSlot, unknown>>
    : {};
  const placedPaths = new Set<string>();

  for (const slot of paneSlots) {
    const path = storedPanes[slot];
    if (typeof path !== "string" || !openPaths.includes(path) || placedPaths.has(path)) continue;
    if (visiblePaneCount(panes) >= MAX_VISIBLE_PANES) break;
    panes[slot] = path;
    placedPaths.add(path);
  }

  const storedActivePath = typeof stored.activePath === "string" && openPaths.includes(stored.activePath)
    ? stored.activePath
    : openPaths[0] ?? null;
  const activePath = storedActivePath;

  if (!panes.center && activePath && !placedPaths.has(activePath)) {
    panes.center = activePath;
    placedPaths.add(activePath);
  }
  if (!panes.center && openPaths[0]) {
    const existingSlot = paneForPath(panes, openPaths[0]);
    if (existingSlot) panes[existingSlot] = null;
    panes.center = openPaths[0];
  }

  if (activePath && !paneForPath(panes, activePath)) {
    panes.center = activePath;
  }

  const focusedPane = isPaneSlot(stored.focusedPane) && panes[stored.focusedPane]
    ? stored.focusedPane
    : paneForPath(panes, activePath ?? "") ?? "center";

  return { activePath, focusedPane, openPaths, panes };
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

async function readError(response: Response) {
  const body = (await response.json().catch(() => ({}))) as ApiError;
  if (typeof body.error === "string") return body.error;
  if (body.error && typeof body.error === "object" && "message" in body.error) {
    const message = (body.error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "Не удалось выполнить действие";
}

async function fetchVaultSnapshot() {
  const response = await fetch("/api/vault", { cache: "no-store" });
  if (!response.ok) throw new Error(await readError(response));
  const body = (await response.json()) as { items: VaultEntry[]; folders?: VaultFolderEntry[] };
  return {
    folders: body.folders ?? collectFolders(body.items)
      .filter(Boolean)
      .map((path) => ({ kind: "folder" as const, name: folderLabel(path), path, updatedAt: "" })),
    items: body.items,
  };
}

async function fetchNoteContent(path: string) {
  const response = await fetch(`/api/vault/note?path=${encodeURIComponent(path)}`, { cache: "no-store" });
  if (!response.ok) throw new Error(await readError(response));
  const body = (await response.json()) as { content: string };
  return body.content;
}

function PanelSettings({
  position,
  theme,
  onPositionChange,
  onThemeChange,
  onHide,
}: {
  position: PanelPosition;
  theme: ThemePreference;
  onPositionChange: (position: PanelPosition) => void;
  onThemeChange: (theme: ThemePreference) => void;
  onHide: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Настройки панели Vault"
          className="grid size-8 place-items-center rounded-md text-sm font-semibold tracking-[0.08em] text-muted-foreground outline-none transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70"
          title="Расположение и тема"
          type="button"
        >
          <span aria-hidden="true">•••</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 rounded-lg shadow-md">
        <DropdownMenuLabel>Расположение</DropdownMenuLabel>
        {dockOptions.map(({ value, label, Icon }) => (
          <DropdownMenuItem key={value} onSelect={() => onPositionChange(value)}>
            <Icon className="size-4" motion="none" />
            <span className="min-w-0 flex-1 truncate">{label.replace("Переместить панель ", "")}</span>
            {position === value ? <CheckIcon className="size-4 text-primary" motion="none" /> : null}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Тема</DropdownMenuLabel>
        {themeOptions.map(({ value, label, Icon }) => (
          <DropdownMenuItem key={value} onSelect={() => onThemeChange(value)}>
            <Icon className="size-4" motion="none" />
            <span className="min-w-0 flex-1">{label}</span>
            {theme === value ? <CheckIcon className="size-4 text-primary" motion="none" /> : null}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onHide}>
          <CloseIcon className="size-4" motion="none" />
          Скрыть Vault
          <span className="ml-auto text-[10px] text-muted-foreground">⌘/Ctrl B</span>
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
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const importDirectoryRef = React.useRef("");
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const canvasScrollRef = React.useRef<HTMLDivElement>(null);
  const openRequestsRef = React.useRef<Record<string, number>>({});
  const hoverPreviewTimerRef = React.useRef<number | null>(null);
  const hoverPreviewCacheRef = React.useRef<Record<string, string | null>>({});
  const hoverPreviewRequestsRef = React.useRef(new Set<string>());
  const libraryPreferencesReadyRef = React.useRef(false);
  const panelPreferencesReadyRef = React.useRef(false);
  const lastVisiblePanelRef = React.useRef<VaultLibraryPresentation>("expanded");
  const themePreferenceReadyRef = React.useRef(false);
  const [items, setItems] = React.useState<VaultEntry[]>([]);
  const [folders, setFolders] = React.useState<VaultFolderEntry[]>([]);
  const [tabs, setTabs] = React.useState<WorkspaceTab[]>([]);
  const [activePath, setActivePath] = React.useState<string | null>(null);
  const [paneTabs, setPaneTabs] = React.useState<PaneTabs>(emptyPaneTabs);
  const [focusedPane, setFocusedPane] = React.useState<PaneSlot>("center");
  const [libraryView, setLibraryView] = React.useState<LibraryView>("tree");
  const [expandedFolders, setExpandedFolders] = React.useState<string[]>([]);
  const [libraryOrder, setLibraryOrder] = React.useState<string[]>([]);
  const [graphFolder, setGraphFolder] = React.useState("all");
  const [editorMode, setEditorMode] = React.useState<EditorMode>("edit");
  const [workspaceView, setWorkspaceView] = React.useState<WorkspaceView>("document");
  const [panelPosition, setPanelPosition] = React.useState<PanelPosition>("right");
  const [panelPresentation, setPanelPresentation] = React.useState<VaultLibraryPresentation>("expanded");
  const [theme, setTheme] = React.useState<ThemePreference>("system");
  const [isLoading, setIsLoading] = React.useState(true);
  const [isWorkspaceReady, setIsWorkspaceReady] = React.useState(false);
  const [savingPaths, setSavingPaths] = React.useState<string[]>([]);
  const [isCreating, setIsCreating] = React.useState(false);
  const [isUploading, setIsUploading] = React.useState(false);
  const [busyLibraryPaths, setBusyLibraryPaths] = React.useState<string[]>([]);
  const [message, setMessage] = React.useState<string | null>(null);
  const [formattingHint, setFormattingHint] = React.useState<FormattingHint | null>(null);
  const [hoverPreview, setHoverPreview] = React.useState<HoverPreview | null>(null);
  const [hoverPreviewContentByPath, setHoverPreviewContentByPath] = React.useState<Record<string, string | null>>({});
  const [activeHeadingId, setActiveHeadingId] = React.useState<string | null>(null);
  const selectedTab = tabs.find((tab) => tab.item.path === activePath) ?? null;
  const selected = selectedTab?.item ?? null;
  const content = selectedTab?.content ?? "";
  const savedContent = selectedTab?.savedContent ?? "";
  const isSaving = activePath ? savingPaths.includes(activePath) : false;
  const activeFolder = graphFolder;

  function updateActiveTab(update: (tab: WorkspaceTab) => WorkspaceTab) {
    setTabs((current) => current.map((tab) => (
      tab.item.path === activePath ? update(tab) : tab
    )));
  }

  function setContent(value: string) {
    updateActiveTab((tab) => ({ ...tab, content: value }));
  }

  React.useEffect(() => {
    const storedTheme = window.localStorage.getItem("archeion-theme");
    const frame = window.requestAnimationFrame(() => {
      if (storedTheme === "light" || storedTheme === "dark" || storedTheme === "system") {
        setTheme(storedTheme);
      }
      themePreferenceReadyRef.current = true;
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  React.useEffect(() => () => {
    if (hoverPreviewTimerRef.current !== null) window.clearTimeout(hoverPreviewTimerRef.current);
  }, []);

  React.useEffect(() => {
    const storedPosition = window.localStorage.getItem("archeion-panel-position");
    const storedPresentation = window.localStorage.getItem(PANEL_MODE_STORAGE_KEY);
    const storedCompact = window.localStorage.getItem(LEGACY_PANEL_COMPACT_STORAGE_KEY);
    const frame = window.requestAnimationFrame(() => {
      if (storedPosition === "left" || storedPosition === "right" || storedPosition === "top" || storedPosition === "bottom") {
        setPanelPosition(storedPosition);
      }
      if (storedPresentation === "expanded" || storedPresentation === "compact" || storedPresentation === "hidden") {
        setPanelPresentation(storedPresentation);
      } else if (storedCompact === "true") {
        setPanelPresentation("compact");
      }
      panelPreferencesReadyRef.current = true;
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  React.useEffect(() => {
    let stored: StoredLibrary = {};
    try {
      stored = JSON.parse(window.localStorage.getItem(LIBRARY_STORAGE_KEY) ?? "{}") as StoredLibrary;
    } catch {
      stored = {};
    }

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
  }, []);

  React.useEffect(() => {
    if (!themePreferenceReadyRef.current) return;
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    if (theme !== "system") root.classList.add(theme);
    window.localStorage.setItem("archeion-theme", theme);
  }, [theme]);

  React.useEffect(() => {
    if (!panelPreferencesReadyRef.current) return;
    window.localStorage.setItem("archeion-panel-position", panelPosition);
    window.localStorage.setItem(PANEL_MODE_STORAGE_KEY, panelPresentation);
  }, [panelPosition, panelPresentation]);

  React.useEffect(() => {
    if (!libraryPreferencesReadyRef.current) return;
    window.localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify({
      expandedFolders,
      order: libraryOrder,
      view: libraryView,
    } satisfies StoredLibrary));
  }, [expandedFolders, libraryOrder, libraryView]);

  React.useEffect(() => {
    function toggleQuickPreview(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "h") return;
      if (event.target !== textareaRef.current) return;

      event.preventDefault();
      if (visiblePaneCount(paneTabs) > 1) {
        setMessage("Быстрый просмотр доступен, когда на экране одна файловая панель.");
        return;
      }
      setFormattingHint(null);
      setEditorMode((mode) => (mode === "split" ? "edit" : "split"));
    }

    window.addEventListener("keydown", toggleQuickPreview);
    return () => window.removeEventListener("keydown", toggleQuickPreview);
  }, [paneTabs]);

  React.useEffect(() => {
    if (panelPresentation !== "hidden") lastVisiblePanelRef.current = panelPresentation;
  }, [panelPresentation]);

  React.useEffect(() => {
    function toggleVaultPanel(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "b") return;
      event.preventDefault();
      setPanelPresentation((current) => current === "hidden" ? lastVisiblePanelRef.current : "hidden");
    }

    window.addEventListener("keydown", toggleVaultPanel);
    return () => window.removeEventListener("keydown", toggleVaultPanel);
  }, []);

  function focusPath(path: string) {
    const existingPane = paneForPath(paneTabs, path);
    if (existingPane) {
      setFocusedPane(existingPane);
    } else {
      setPaneTabs((current) => ({ ...current, [focusedPane]: path }));
    }
    setActivePath(path);
    setWorkspaceView("document");
    setFormattingHint(null);
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

    if (tabs.length >= MAX_OPEN_TABS) {
      setMessage(`Можно открыть не больше ${MAX_OPEN_TABS} вкладок. Закройте одну из открытых.`);
      return;
    }

    const requestId = (openRequestsRef.current[item.path] ?? 0) + 1;
    openRequestsRef.current[item.path] = requestId;
    const nextTab: WorkspaceTab = {
      content: "",
      isLoading: item.kind === "note",
      item,
      savedContent: "",
    };

    setTabs((current) => [...current, nextTab]);
    setPaneTabs((current) => ({ ...current, [focusedPane]: item.path }));
    setActivePath(item.path);
    setMessage(null);
    setWorkspaceView("document");
    setFormattingHint(null);

    if (item.kind === "attachment") return;

    try {
      const response = await fetch(`/api/vault/note?path=${encodeURIComponent(item.path)}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error(await readError(response));

      const body = (await response.json()) as { content: string };
      if (openRequestsRef.current[item.path] !== requestId) return;
      setTabs((current) => current.map((tab) => tab.item.path === item.path
        ? { ...tab, content: body.content, isLoading: false, savedContent: body.content }
        : tab));
      setEditorMode("edit");
    } catch (error) {
      if (openRequestsRef.current[item.path] !== requestId) return;
      const fallbackPath = tabs.at(-1)?.item.path ?? null;
      setTabs((current) => current.filter((tab) => tab.item.path !== item.path));
      setPaneTabs((current) => {
        const nextPanes = paneSlots.reduce<PaneTabs>((next, slot) => ({
          ...next,
          [slot]: current[slot] === item.path ? null : current[slot],
        }), { ...emptyPaneTabs });
        if (!nextPanes.center && fallbackPath) {
          const fallbackPane = paneForPath(nextPanes, fallbackPath);
          if (fallbackPane) nextPanes[fallbackPane] = null;
          nextPanes.center = fallbackPath;
        }
        return nextPanes;
      });
      setActivePath((current) => current === item.path ? fallbackPath : current);
      setMessage(error instanceof Error ? error.message : "Не удалось открыть заметку");
    }
  }

  async function refreshItems() {
    const snapshot = await fetchVaultSnapshot();
    setItems(snapshot.items);
    setFolders(snapshot.folders);
    return snapshot.items;
  }

  async function loadHoverPreview(item: VaultEntry) {
    if (item.kind !== "note" || item.path in hoverPreviewCacheRef.current || hoverPreviewRequestsRef.current.has(item.path)) return;

    hoverPreviewRequestsRef.current.add(item.path);
    try {
      const response = await fetch(`/api/vault/note?path=${encodeURIComponent(item.path)}`, { cache: "no-store" });
      if (!response.ok) return;

      const body = (await response.json()) as { content: string };
      hoverPreviewCacheRef.current[item.path] = body.content;
      setHoverPreviewContentByPath((current) => ({ ...current, [item.path]: body.content }));
    } catch {
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

    void (async () => {
      try {
        const snapshot = await fetchVaultSnapshot();
        const nextItems = snapshot.items;
        if (!active) return;
        const restored = sanitiseStoredWorkspace(window.localStorage.getItem(WORKSPACE_STORAGE_KEY), nextItems);
        const itemsByPath = new Map(nextItems.map((item) => [item.path, item]));
        const tabsToRestore = restored.openPaths.flatMap((path) => {
          const item = itemsByPath.get(path);
          return item ? [{ content: "", isLoading: item.kind === "note", item, savedContent: "" }] : [];
        });

        const restoredTabs = (await Promise.all(tabsToRestore.map(async (tab) => {
          if (tab.item.kind !== "note") return { ...tab, isLoading: false };
          try {
            const noteContent = await fetchNoteContent(tab.item.path);
            return { ...tab, content: noteContent, isLoading: false, savedContent: noteContent };
          } catch (error) {
            if (active) setMessage(error instanceof Error ? error.message : "Не удалось открыть заметку");
            return null;
          }
        }))).filter((tab): tab is WorkspaceTab => tab !== null);

        if (!active) return;
        const restoredPaths = new Set(restoredTabs.map((tab) => tab.item.path));
        const restoredActivePath = restored.activePath && restoredPaths.has(restored.activePath)
          ? restored.activePath
          : restoredTabs[0]?.item.path ?? null;
        const restoredPanes = { ...restored.panes };
        for (const slot of paneSlots) {
          if (restoredPanes[slot] && !restoredPaths.has(restoredPanes[slot])) restoredPanes[slot] = null;
        }
        if (!restoredPanes.center && restoredActivePath) {
          const previousPane = paneForPath(restoredPanes, restoredActivePath);
          if (previousPane) restoredPanes[previousPane] = null;
          restoredPanes.center = restoredActivePath;
        }
        const restoredFocusedPane = restoredPanes[restored.focusedPane]
          ? restored.focusedPane
          : paneForPath(restoredPanes, restoredActivePath ?? "") ?? "center";

        setItems(nextItems);
        setFolders(snapshot.folders);
        setTabs(restoredTabs);
        setActivePath(restoredActivePath);
        setPaneTabs(restoredPanes);
        setFocusedPane(restoredFocusedPane);
      } catch (error) {
        if (active) {
          setMessage(error instanceof Error ? error.message : "Не удалось открыть Vault");
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
    };
  }, []);

  React.useEffect(() => {
    if (!isWorkspaceReady) return;
    const timer = window.setTimeout(() => {
      window.localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify({
        activePath,
        focusedPane,
        openPaths: tabs.map((tab) => tab.item.path),
        panes: paneTabs,
      } satisfies StoredWorkspace));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [activePath, focusedPane, isWorkspaceReady, paneTabs, tabs]);

  async function createLibraryNote({ directory, name }: VaultLibraryCreateInput) {
    setIsCreating(true);
    setMessage(null);

    try {
      const response = await fetch("/api/vault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ directory, title: name, type: "note" }),
      });
      if (!response.ok) throw new Error(await readError(response));

      const body = (await response.json()) as { item: VaultEntry };
      revealFolder(parentFolder(body.item.path));
      await refreshItems();
      await openItem(body.item);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Не удалось создать заметку";
      setMessage(reason);
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
    setMessage(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("directory", importDirectoryRef.current);
      const response = await fetch("/api/vault/upload", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) throw new Error(await readError(response));

      const body = (await response.json()) as { item: VaultEntry };
      revealFolder(parentFolder(body.item.path));
      await refreshItems();
      await openItem(body.item);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось добавить файл");
    } finally {
      setIsUploading(false);
    }
  }

  async function createLibraryFolder({ directory, name }: VaultLibraryCreateInput) {
    setMessage(null);
    setBusyLibraryPaths((current) => [...new Set([...current, directory || "__root__"])]);

    try {
      const response = await fetch("/api/vault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ directory, name, type: "folder" }),
      });
      if (!response.ok) throw new Error(await readError(response));

      const body = (await response.json()) as { folder: VaultFolderEntry };
      await refreshItems();
      revealFolder(body.folder.path);
      setMessage(`Папка «${body.folder.name}» создана`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Не удалось создать папку";
      setMessage(reason);
      throw error;
    } finally {
      setBusyLibraryPaths((current) => current.filter((path) => path !== (directory || "__root__")));
    }
  }

  function normalisePathChanges(body: { oldPath?: string; newPath?: string; pathChanges?: PathChange[] }) {
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
    const reason = "Дождитесь окончания загрузки или сохранения файла";
    setMessage(reason);
    throw new Error(reason);
  }

  async function renameLibraryTarget(target: VaultLibraryTarget, name: string) {
    requireIdleTarget(target);
    setMessage(null);
    setBusyLibraryPaths((current) => [...new Set([...current, target.path])]);

    try {
      const response = await fetch("/api/vault/item", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, path: target.path }),
      });
      if (!response.ok) throw new Error(await readError(response));

      const body = (await response.json()) as { oldPath?: string; newPath?: string; pathChanges?: PathChange[] };
      const changes = normalisePathChanges(body);
      const nextItems = await refreshItems();
      applyPathChanges(changes, nextItems);
      setMessage("Название обновлено");
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Не удалось переименовать";
      setMessage(reason);
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
      const reason = "Нельзя переместить папку внутрь самой себя";
      setMessage(reason);
      throw new Error(reason);
    }

    setMessage(null);
    setBusyLibraryPaths((current) => [...new Set([...current, input.path])]);
    try {
      const response = await fetch("/api/vault/item", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destination: input.destination, path: input.path }),
      });
      if (!response.ok) throw new Error(await readError(response));

      const body = (await response.json()) as { oldPath?: string; newPath?: string; pathChanges?: PathChange[] };
      const changes = normalisePathChanges(body);
      const nextItems = await refreshItems();
      applyPathChanges(changes, nextItems);
      revealFolder(input.destination);
      setMessage(input.destination ? `Перемещено в «${folderLabel(input.destination)}»` : "Перемещено в корень Vault");
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Не удалось переместить";
      setMessage(reason);
      throw error;
    } finally {
      setBusyLibraryPaths((current) => current.filter((path) => path !== input.path));
    }
  }

  function removeTargetFromWorkspace(target: VaultLibraryTarget) {
    const isRemoved = (path: string) => target.kind === "folder" ? pathIsWithin(path, target.path) : path === target.path;
    const remainingTabs = tabs.filter((tab) => !isRemoved(tab.item.path));
    const nextActivePath = activePath && !isRemoved(activePath)
      ? activePath
      : remainingTabs[0]?.item.path ?? null;
    const nextPanes = paneSlots.reduce<PaneTabs>((next, slot) => ({
      ...next,
      [slot]: paneTabs[slot] && !isRemoved(paneTabs[slot]) ? paneTabs[slot] : null,
    }), { ...emptyPaneTabs });

    if (!nextPanes.center && nextActivePath) {
      const occupied = paneForPath(nextPanes, nextActivePath);
      if (occupied) nextPanes[occupied] = null;
      nextPanes.center = nextActivePath;
    }

    setTabs(remainingTabs);
    setPaneTabs(nextPanes);
    setActivePath(nextActivePath);
    setFocusedPane(paneForPath(nextPanes, nextActivePath ?? "") ?? "center");
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
      const reason = "Сначала сохраните изменения в открытых заметках";
      setMessage(reason);
      throw new Error(reason);
    }

    setMessage(null);
    setBusyLibraryPaths((current) => [...new Set([...current, target.path])]);
    try {
      const response = await fetch("/api/vault/item", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: target.path }),
      });
      if (!response.ok) throw new Error(await readError(response));

      removeTargetFromWorkspace(target);
      await refreshItems();
      setMessage(target.kind === "folder" ? "Папка удалена" : "Файл удалён");
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Не удалось удалить";
      setMessage(reason);
      throw error;
    } finally {
      setBusyLibraryPaths((current) => current.filter((path) => path !== target.path));
    }
  }

  async function searchVault(query: string): Promise<readonly VaultLibrarySearchResult[]> {
    const response = await fetch(`/api/vault/search?q=${encodeURIComponent(query)}`, { cache: "no-store" });
    if (!response.ok) throw new Error(await readError(response));
    const body = (await response.json()) as { results: VaultLibrarySearchResult[] };
    return body.results;
  }

  function openImportPicker(directory: string) {
    importDirectoryRef.current = directory;
    fileInputRef.current?.click();
  }

  async function saveNote() {
    if (!selected || selected.kind !== "note") return;

    const path = selected.path;
    setSavingPaths((current) => current.includes(path) ? current : [...current, path]);
    setMessage(null);

    try {
      const response = await fetch("/api/vault/note", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: selected.path, content }),
      });
      if (!response.ok) throw new Error(await readError(response));

      const body = (await response.json()) as { item: VaultEntry };
      setItems((current) => current.map((item) => (item.path === body.item.path ? body.item : item)));
      setTabs((current) => current.map((tab) => tab.item.path === body.item.path
        ? { ...tab, item: body.item, savedContent: content }
        : tab));
      hoverPreviewCacheRef.current[body.item.path] = content;
      setHoverPreviewContentByPath((current) => ({ ...current, [body.item.path]: content }));
      setMessage("Изменения сохранены в Markdown-файл");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить заметку");
    } finally {
      setSavingPaths((current) => current.filter((candidate) => candidate !== path));
    }
  }

  function closeTab(path: string) {
    const tab = tabs.find((candidate) => candidate.item.path === path);
    if (!tab) return;
    if (tab.item.kind === "note" && tab.content !== tab.savedContent) {
      setMessage("Сначала сохраните изменения, затем закройте вкладку.");
      return;
    }

    const closingIndex = tabs.findIndex((candidate) => candidate.item.path === path);
    const remainingTabs = tabs.filter((candidate) => candidate.item.path !== path);
    const nextActiveTab = remainingTabs[Math.min(closingIndex, remainingTabs.length - 1)] ?? null;
    const nextPanes = paneSlots.reduce<PaneTabs>((next, slot) => ({
      ...next,
      [slot]: paneTabs[slot] === path ? null : paneTabs[slot],
    }), { ...emptyPaneTabs });

    if (!nextPanes.center && nextActiveTab) {
      const nextActivePane = paneForPath(nextPanes, nextActiveTab.item.path);
      if (nextActivePane) nextPanes[nextActivePane] = null;
      nextPanes.center = nextActiveTab.item.path;
    }

    setTabs(remainingTabs);
    setPaneTabs(nextPanes);
    if (activePath === path) {
      const nextPath = nextActiveTab?.item.path ?? null;
      setActivePath(nextPath);
      setFocusedPane(paneForPath(nextPanes, nextPath ?? "") ?? "center");
    }
    delete openRequestsRef.current[path];
    setFormattingHint(null);
  }

  function placeActiveTab(target: PanelPosition) {
    if (!activePath || tabs.length < 2) {
      setMessage("Откройте хотя бы две вкладки, чтобы разделить экран.");
      return;
    }

    const source = paneForPath(paneTabs, activePath);
    if (source === target) return;
    const targetPath = paneTabs[target];
    const addsPane = !targetPath && (source === "center" || !source);
    if (addsPane && visiblePaneCount(paneTabs) >= MAX_VISIBLE_PANES) {
      setMessage(`Одновременно можно показать не больше ${MAX_VISIBLE_PANES} панелей.`);
      return;
    }

    const nextPanes = { ...paneTabs };
    if (source) nextPanes[source] = targetPath;
    nextPanes[target] = activePath;

    if (!nextPanes.center) {
      const replacementPath = targetPath && targetPath !== activePath
        ? targetPath
        : tabs.find((tab) => tab.item.path !== activePath && !paneForPath(nextPanes, tab.item.path))?.item.path;
      if (!replacementPath) {
        setMessage("Для разделения экрана нужна ещё одна открытая вкладка.");
        return;
      }
      const replacementPane = paneForPath(nextPanes, replacementPath);
      if (replacementPane) nextPanes[replacementPane] = null;
      nextPanes.center = replacementPath;
    }

    setPaneTabs(nextPanes);
    setFocusedPane(target);
    const activeTab = tabs.find((tab) => tab.item.path === activePath);
    const activeTitle = activeTab
      ? activeTab.item.kind === "note" ? noteTitle(activeTab.item) : activeTab.item.name
      : activePath;
    setMessage(`${activeTitle} · ${paneLabels[target].toLowerCase()}`);
  }

  function collapsePane(slot: PanelPosition) {
    const path = paneTabs[slot];
    if (!path) return;
    const nextPanes = { ...paneTabs, [slot]: null };
    setPaneTabs(nextPanes);
    if (activePath === path) {
      const centerPath = nextPanes.center;
      setActivePath(centerPath);
      setFocusedPane("center");
    }
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
  const showDocumentOutline = visiblePanes === 1 && documentHeadings.length > 0 && editorMode !== "split";
  const graphRefreshKey = items
    .filter((item) => item.kind === "note")
    .map((item) => `${item.path}:${item.size}:${item.updatedAt}`)
    .join("|");

  const sidePanelTrack = panelPresentation === "hidden"
    ? "0px"
    : panelPresentation === "compact"
      ? "3.5rem"
      : "clamp(17.5rem, 28vw, 20rem)";
  const horizontalPanelTrack = panelPresentation === "hidden"
    ? "0px"
    : panelPresentation === "compact"
      ? "3.5rem"
      : "clamp(17rem, 32dvh, 21rem)";
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
  const panelBorderClass = panelPresentation === "hidden" ? "" : {
    bottom: "border-t",
    left: "border-r",
    right: "border-l",
    top: "border-b",
  }[panelPosition];

  const paneGridStyle: React.CSSProperties = {
    gridTemplateAreas: '"top top top" "left center right" "bottom bottom bottom"',
    gridTemplateColumns: `${paneTabs.left ? "minmax(0,0.72fr)" : "0"} minmax(0,1.35fr) ${paneTabs.right ? "minmax(0,0.72fr)" : "0"}`,
    gridTemplateRows: `${paneTabs.top ? "minmax(0,0.72fr)" : "0"} minmax(0,1.35fr) ${paneTabs.bottom ? "minmax(0,0.72fr)" : "0"}`,
  };

  const markdownEditor = (
    <Textarea
      aria-label="Редактор Markdown"
      className={cn(
        "min-h-[calc(100dvh-15rem)] resize-none rounded-none border-0 bg-transparent px-0 py-0 font-mono text-[15px] leading-7 shadow-none focus-visible:ring-0 md:min-h-[calc(100dvh-13rem)]",
        isHorizontalDock && "lg:min-h-[calc(100dvh-30rem)]",
      )}
      onChange={(event) => {
        setContent(event.target.value);
        setFormattingHint(null);
      }}
      onKeyUp={() => {
        updateFormattingHint();
        updateActiveHeadingFromEditor();
      }}
      onScroll={updateFormattingHint}
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
    const borderClass = {
      bottom: "lg:border-t",
      center: "",
      left: "lg:border-r",
      right: "lg:border-l",
      top: "lg:border-b",
    }[slot];

    return (
      <section
        aria-label={`${paneLabels[slot]} панель: ${title}`}
        className={cn(
          "min-h-0 min-w-0 flex-col overflow-hidden bg-[var(--editor)]",
          isActive ? "flex" : "hidden lg:flex",
          borderClass,
          isActive && visiblePanes > 1 && "ring-1 ring-inset ring-primary/35",
        )}
        id={`workspace-pane-${slot}`}
        key={slot}
        onFocusCapture={() => {
          if (!isActive) focusPath(path);
        }}
        onPointerDown={() => {
          if (!isActive) focusPath(path);
        }}
        style={{ gridArea: slot }}
      >
        {visiblePanes > 1 ? (
          <header className="flex h-9 shrink-0 items-center gap-2 border-b bg-background/55 px-3 text-xs">
            {tab.item.kind === "note"
              ? <NoteIcon className="size-3.5 text-muted-foreground" motion="none" />
              : <AttachmentIcon className="size-3.5 text-muted-foreground" motion="none" />}
            <span className="min-w-0 flex-1 truncate font-medium">{title}</span>
            {tabIsDirty ? <span className="size-1.5 shrink-0 rounded-full bg-primary" title="Есть несохранённые изменения" /> : null}
            <span className="text-[10px] text-muted-foreground">{paneLabels[slot]}</span>
            {slot !== "center" ? (
              <button
                aria-label={`Убрать панель ${paneLabels[slot].toLowerCase()}`}
                className="grid size-7 place-items-center rounded-[4px] text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70"
                onClick={() => collapsePane(slot)}
                title="Убрать разделение"
                type="button"
              >
                <CloseIcon className="size-3.5" motion="press" />
              </button>
            ) : null}
          </header>
        ) : null}

        <div
          className="min-h-0 flex-1 overflow-y-auto px-5 py-7 md:px-8 md:py-8"
          onScroll={isActive && editorMode !== "edit" ? updateActiveHeadingFromPreview : undefined}
          ref={isActive ? canvasScrollRef : undefined}
        >
          {tab.isLoading ? <LoadingCanvas /> : null}

          {!tab.isLoading && tab.item.kind === "note" && isActive ? (
            <div className={cn("relative mx-auto min-h-full", showDocumentOutline ? "max-w-5xl" : "max-w-3xl")}>
              <div className="mx-auto flex min-h-full max-w-3xl flex-col">
                {editorMode === "edit" || (editorMode === "split" && visiblePanes > 1) ? markdownEditor : null}
                {editorMode === "preview" ? <MarkdownPreview content={tab.content} /> : null}
                {editorMode === "split" && visiblePanes === 1 ? (
                  <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.85fr)]">
                    <div className="min-w-0">{markdownEditor}</div>
                    <aside aria-label="Быстрый просмотр Markdown" className="min-w-0 border-t pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
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
              <MarkdownPreview content={tab.content} headingPrefix={`pane-${slot}-heading`} />
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
                  <ExternalLinkIcon className="size-4" />
                  Открыть файл
                </a>
              </Button>
            </div>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <>
      <main className="h-[100dvh] overflow-hidden bg-background text-foreground selection:bg-[var(--selection)]">
      <div
        className="vault-workspace-shell grid h-full min-h-0 transition-[grid-template-columns,grid-template-rows] duration-200 ease-out motion-reduce:transition-none"
        data-panel-position={panelPosition}
        data-panel-presentation={panelPresentation}
        style={workspaceShellStyle}
      >
        <section
          aria-label="Рабочее полотно"
          className="grid h-full min-h-0 min-w-0 grid-rows-[auto_auto_minmax(0,1fr)] bg-[var(--editor)]"
          style={{ gridArea: "canvas" }}
        >
          <nav aria-label="Открытые файлы" className="row-start-1 z-20 flex min-w-0 items-center border-b bg-muted/55 px-2 py-1.5">
            <div className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex min-w-max items-center gap-1" role="tablist">
                <AnimatePresence initial={false}>
                  {tabs.map((tab) => {
                    const path = tab.item.path;
                    const isActive = activePath === path && workspaceView === "document";
                    const pane = paneForPath(paneTabs, path);
                    const tabIsDirty = tab.item.kind === "note" && tab.content !== tab.savedContent;
                    const title = tab.item.kind === "note" ? noteTitle(tab.item) : tab.item.name;

                    return (
                      <motion.div
                        animate={{ opacity: 1, scale: 1, x: 0 }}
                        className={cn(
                          "group/tab relative flex h-9 min-w-32 max-w-52 items-center overflow-hidden rounded-lg text-muted-foreground transition-[background-color,color] duration-150 hover:bg-background/50 hover:text-foreground motion-reduce:transition-none",
                          isActive && "text-foreground",
                        )}
                        exit={prefersReducedMotion ? undefined : { opacity: 0, scale: 0.96, x: -6 }}
                        initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.96, x: -6 }}
                        key={path}
                        layout={prefersReducedMotion ? false : "position"}
                        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                      >
                        {isActive ? (
                          prefersReducedMotion ? (
                            <span aria-hidden="true" className="absolute inset-0 rounded-lg bg-[var(--editor)] shadow-sm ring-1 ring-border/70" />
                          ) : (
                            <motion.span
                              aria-hidden="true"
                              className="absolute inset-0 rounded-lg bg-[var(--editor)] shadow-sm ring-1 ring-border/70"
                              layoutId="workspace-active-tab"
                              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                            />
                          )
                        ) : null}
                        <button
                          aria-controls={pane ? `workspace-pane-${pane}` : undefined}
                          aria-selected={isActive}
                          className="relative z-10 flex min-w-0 flex-1 items-center gap-2 self-stretch rounded-lg pl-3 pr-1 text-left text-xs font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70 motion-reduce:transition-none"
                          onClick={() => activateTab(path)}
                          role="tab"
                          title={path}
                          type="button"
                        >
                          {tab.item.kind === "note"
                            ? <NoteIcon className={cn("size-3.5 shrink-0 transition-colors duration-150", isActive && "text-primary")} motion="press" />
                            : <AttachmentIcon className={cn("size-3.5 shrink-0 transition-colors duration-150", isActive && "text-primary")} motion="press" />}
                          <span className="truncate">{title}</span>
                          {tabIsDirty ? <span aria-label="Есть несохранённые изменения" className="size-1.5 shrink-0 rounded-full bg-primary" /> : null}
                          {pane && pane !== "center" ? (
                            <span className="shrink-0 rounded-[4px] bg-muted px-1 py-0.5 text-[9px] font-medium text-muted-foreground">{paneLabels[pane]}</span>
                          ) : null}
                        </button>
                        <button
                          aria-label={`Закрыть ${title}`}
                          className={cn(
                            "relative z-10 mr-0.5 grid size-8 shrink-0 place-items-center rounded-md opacity-0 outline-none transition-[background-color,opacity] duration-150 hover:bg-muted hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/70 motion-reduce:transition-none group-hover/tab:opacity-70",
                            isActive && "opacity-55",
                          )}
                          onClick={() => closeTab(path)}
                          title={`Закрыть ${title}`}
                          type="button"
                        >
                          <CloseIcon className="size-3.5" motion="press" />
                        </button>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
                {tabs.length === 0 ? (
                  <p className="flex h-9 items-center px-3 text-xs text-muted-foreground">Откройте файл из Vault</p>
                ) : null}
              </div>
            </div>

            <div aria-label="Разделить экран" className="ml-2 hidden h-8 shrink-0 self-center items-center gap-0.5 border-l border-border/70 pl-2 md:flex" role="group">
              <span className="mr-1 min-w-8 whitespace-nowrap text-center text-[10px] tabular-nums text-muted-foreground" title={`${visiblePanes} из ${MAX_VISIBLE_PANES} панелей на экране`}>
                {visiblePanes}/{MAX_VISIBLE_PANES}
              </span>
              {splitOptions.map(({ value, label, Icon }) => {
                const sourcePane = activePath ? paneForPath(paneTabs, activePath) : null;
                const wouldAddPane = !paneTabs[value] && (sourcePane === "center" || !sourcePane);
                const isDisabled = !activePath || tabs.length < 2 || (wouldAddPane && visiblePanes >= MAX_VISIBLE_PANES);
                return (
                  <button
                    aria-label={label}
                    className="grid size-8 place-items-center rounded-md text-muted-foreground outline-none transition-colors duration-150 hover:bg-background/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70 disabled:pointer-events-none disabled:opacity-35"
                    disabled={isDisabled}
                    key={value}
                    onClick={() => placeActiveTab(value)}
                    title={isDisabled && tabs.length < 2 ? "Откройте ещё одну вкладку" : label}
                    type="button"
                  >
                    <Icon className="size-3.5" motion="press" />
                  </button>
                );
              })}
            </div>
          </nav>

          <header className="row-start-2 flex min-h-14 min-w-0 items-center justify-between gap-4 border-b bg-[var(--editor)] px-4 py-2.5 md:px-6">
            <div className="min-w-0">
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

            <div className="flex shrink-0 items-center gap-2">
              <div aria-label="Вид рабочего пространства" className="flex rounded-md bg-muted p-1" role="tablist">
                <button
                  aria-selected={workspaceView === "document"}
                  className={cn(
                    "h-7 rounded-[5px] px-2.5 text-xs font-medium text-muted-foreground outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring/70",
                    workspaceView === "document" && "bg-background text-foreground shadow-sm",
                  )}
                  onClick={() => setWorkspaceView("document")}
                  role="tab"
                  type="button"
                >
                  Документ
                </button>
                <button
                  aria-selected={workspaceView === "brain"}
                  className={cn(
                    "flex h-7 items-center gap-1.5 rounded-[5px] px-2.5 text-xs font-medium text-muted-foreground outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring/70",
                    workspaceView === "brain" && "bg-background text-foreground shadow-sm",
                  )}
                  onClick={() => {
                    setFormattingHint(null);
                    setWorkspaceView("brain");
                  }}
                  role="tab"
                  type="button"
                >
                  <GraphIcon className="size-3.5" motion="press" />
                  <span className="hidden sm:inline">Атлас</span>
                </button>
              </div>

              {workspaceView === "document" && selected?.kind === "note" ? (
                <>
                <div aria-label="Режим документа" className="hidden rounded-md bg-muted p-1 sm:flex" role="tablist">
                  <button
                    aria-selected={editorMode === "edit"}
                    className={cn("h-7 rounded-[5px] px-2.5 text-xs font-medium text-muted-foreground outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring/70", editorMode === "edit" && "bg-background text-foreground shadow-sm")}
                    onClick={() => setEditorMode("edit")}
                    role="tab"
                    type="button"
                  >
                    Редактор
                  </button>
                  <button
                    aria-selected={editorMode === "split"}
                    className={cn("h-7 rounded-[5px] px-2.5 text-xs font-medium text-muted-foreground outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring/70 disabled:pointer-events-none disabled:opacity-40", editorMode === "split" && "bg-background text-foreground shadow-sm")}
                    disabled={visiblePanes > 1}
                    onClick={() => {
                      setFormattingHint(null);
                      setEditorMode("split");
                    }}
                    role="tab"
                    title={visiblePanes > 1 ? "Уберите разделение файлов, чтобы открыть быстрый просмотр" : undefined}
                    type="button"
                  >
                    Рядом
                  </button>
                  <button
                    aria-selected={editorMode === "preview"}
                    className={cn("h-7 rounded-[5px] px-2.5 text-xs font-medium text-muted-foreground outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring/70", editorMode === "preview" && "bg-background text-foreground shadow-sm")}
                    onClick={() => setEditorMode("preview")}
                    role="tab"
                    type="button"
                  >
                    Просмотр
                  </button>
                </div>
                <button
                  aria-label={editorMode === "edit" ? "Открыть просмотр Markdown" : "Открыть редактор Markdown"}
                  className="h-9 rounded-md bg-muted px-2.5 text-xs font-medium text-muted-foreground outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70 sm:hidden"
                  onClick={() => setEditorMode((mode) => (mode === "edit" ? "preview" : "edit"))}
                  type="button"
                >
                  {editorMode === "edit" ? "Просмотр" : "Редактор"}
                </button>
                <Button className="h-9 rounded-md px-3 shadow-none" disabled={!isDirty || isSaving} onClick={() => void saveNote()} size="sm" type="button">
                  {isSaving ? (
                    <LoadingIcon className="size-3.5" motion="loop" />
                  ) : isDirty ? (
                    <EditIcon className="size-3.5" />
                  ) : (
                    <CheckIcon className="size-3.5" motion="none" />
                  )}
                  <span>{isSaving ? "Сохранение…" : isDirty ? "Сохранить" : "Сохранено"}</span>
                </Button>
                </>
              ) : null}
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
              <div className="block h-full min-h-0 overflow-hidden lg:grid" style={paneGridStyle}>
                {paneSlots.map((slot) => paneTabs[slot] ? renderWorkspacePane(slot, paneTabs[slot]) : null)}
              </div>
            ) : (
              <div className="mx-auto flex h-full max-w-md flex-col items-start px-6 pt-16">
                <span className="grid size-11 place-items-center rounded-lg bg-accent text-accent-foreground">
                  <FolderOpenIcon className="size-5" />
                </span>
                <h2 className="mt-5 text-xl font-semibold tracking-[-0.02em]">Раскройте папку и выберите файл</h2>
                <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">Файлы открываются во вкладках сверху. Одновременно можно держать до {MAX_OPEN_TABS} вкладок.</p>
              </div>
            )}
          </div>
        </section>

        <aside
          aria-label="Панель Vault"
          className={cn(
            "vault-workspace-panel relative flex min-h-0 min-w-0 flex-col bg-sidebar/80 transition-[opacity] duration-150",
            panelPresentation === "hidden" ? "overflow-visible" : "overflow-hidden",
            panelBorderClass,
          )}
          data-panel-position={panelPosition}
          data-panel-presentation={panelPresentation}
          style={{ gridArea: "panel" }}
        >
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
            onPresentationChange={setPanelPresentation}
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
                onHide={() => setPanelPresentation("hidden")}
                onPositionChange={setPanelPosition}
                onThemeChange={setTheme}
                position={panelPosition}
                theme={theme}
              />
            )}
            view={libraryView}
          />
        </aside>
      </div>

      {message ? (
        <p className={cn("fixed bottom-5 z-50 max-w-sm rounded-md bg-foreground px-3 py-2 text-sm text-background shadow-lg", panelPosition === "left" ? "right-5" : "left-5")} role="status">
          {message}
        </p>
      ) : null}
      </main>

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
