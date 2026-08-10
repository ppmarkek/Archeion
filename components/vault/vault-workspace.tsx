"use client";

import Link from "next/link";
import * as React from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ArcheionMark,
  AttachmentIcon,
  BookIcon,
  DockBottomIcon,
  DockLeftIcon,
  DockRightIcon,
  DockTopIcon,
  FolderIcon,
  MonitorIcon,
  MoonIcon,
  NoteIcon,
  PlusIcon,
  SunIcon,
  UploadIcon,
} from "@/components/vault/vault-icons";
import { cn } from "@/lib/utils";

type VaultEntry = {
  path: string;
  name: string;
  kind: "note" | "attachment";
  mimeType: string;
  size: number;
  updatedAt: string;
};

type ApiError = {
  error?: string;
};

type EditorMode = "edit" | "split" | "preview";
type PanelPosition = "left" | "right" | "top" | "bottom";
type ThemePreference = "light" | "system" | "dark";
type TextFormat = "bold" | "italic" | "heading" | "list" | "quote" | "link";

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

const themeOptions = [
  { value: "light", label: "Светлая тема", Icon: SunIcon },
  { value: "system", label: "Как в системе", Icon: MonitorIcon },
  { value: "dark", label: "Тёмная тема", Icon: MoonIcon },
] as const;

const dockOptions: Array<{
  value: PanelPosition;
  label: string;
  Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
}> = [
  { value: "left", label: "Переместить панель влево", Icon: DockLeftIcon },
  { value: "right", label: "Переместить панель вправо", Icon: DockRightIcon },
  { value: "top", label: "Переместить панель вверх", Icon: DockTopIcon },
  { value: "bottom", label: "Переместить панель вниз", Icon: DockBottomIcon },
];

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

function extractMarkdownHeadings(content: string): DocumentHeading[] {
  const headings: DocumentHeading[] = [];
  let offset = 0;

  for (const line of content.split("\n")) {
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      headings.push({
        id: `outline-heading-${headings.length}`,
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
  return body.error ?? "Не удалось выполнить действие";
}

async function fetchVaultItems() {
  const response = await fetch("/api/vault", { cache: "no-store" });
  if (!response.ok) throw new Error(await readError(response));
  const body = (await response.json()) as { items: VaultEntry[] };
  return body.items;
}

function ThemeControls({
  theme,
  onChange,
}: {
  theme: ThemePreference;
  onChange: (theme: ThemePreference) => void;
}) {
  return (
    <div aria-label="Оформление" className="flex items-center rounded-md bg-muted p-1" role="group">
      {themeOptions.map(({ value, label, Icon }) => (
        <button
          aria-label={label}
          aria-pressed={theme === value}
          className={cn(
            "grid size-7 place-items-center rounded-[5px] text-muted-foreground outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70",
            theme === value && "bg-background text-foreground shadow-sm",
          )}
          key={value}
          onClick={() => onChange(value)}
          title={label}
          type="button"
        >
          <Icon className="size-3.5" />
        </button>
      ))}
    </div>
  );
}

function DockControls({
  position,
  onChange,
}: {
  position: PanelPosition;
  onChange: (position: PanelPosition) => void;
}) {
  return (
    <div aria-label="Расположение панели" className="flex items-center rounded-md bg-muted p-1" role="group">
      {dockOptions.map(({ value, label, Icon }) => (
        <button
          aria-label={label}
          aria-pressed={position === value}
          className={cn(
            "grid size-7 place-items-center rounded-[5px] text-muted-foreground outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/70",
            position === value && "bg-background text-foreground shadow-sm",
          )}
          key={value}
          onClick={() => onChange(value)}
          title={label}
          type="button"
        >
          <Icon className="size-3.5" />
        </button>
      ))}
    </div>
  );
}

function MarkdownPreview({ content }: { content: string }) {
  const blocks = content
    .trim()
    .split(/\n\s*\n/)
    .filter(Boolean);
  const headings = extractMarkdownHeadings(content);
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
      className="group pointer-events-none absolute inset-y-0 right-0 z-20 hidden w-10 transition-[width] duration-200 ease-out hover:w-60 focus-within:w-60 xl:block"
    >
      <nav className="pointer-events-auto sticky top-7 max-h-[calc(100dvh-4rem)] w-full overflow-x-hidden overflow-y-auto rounded-lg border border-transparent bg-transparent py-3 transition-[background-color,border-color] duration-200 group-hover:border-border group-hover:bg-sidebar/95 group-focus-within:border-border group-focus-within:bg-sidebar/95">
        <p className="mb-2 whitespace-nowrap px-3 text-xs font-medium text-muted-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">На странице</p>
        <div className="grid gap-0.5">
          {headings.map((heading) => (
            <button
              aria-current={activeHeadingId === heading.id ? "location" : undefined}
              className={cn(
                "relative flex h-8 w-full items-center overflow-hidden whitespace-nowrap text-left text-sm leading-5 text-muted-foreground outline-none transition-colors duration-150 hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/70 group-hover:pr-3 group-focus-within:pr-3",
                activeHeadingId === heading.id && "group-hover:bg-accent group-hover:text-accent-foreground group-focus-within:bg-accent group-focus-within:text-accent-foreground",
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
                  "absolute right-2 h-1 rounded-full bg-muted-foreground/70 transition-opacity duration-150 group-hover:opacity-0 group-focus-within:opacity-0",
                  activeHeadingId === heading.id && "bg-primary",
                )}
                style={{ width: `${Math.max(12, 28 - Math.min(heading.level - 1, 4) * 4)}px` }}
              />
              <span className="block truncate opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">{heading.text}</span>
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
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const canvasScrollRef = React.useRef<HTMLDivElement>(null);
  const openRequestRef = React.useRef(0);
  const hoverPreviewTimerRef = React.useRef<number | null>(null);
  const hoverPreviewCacheRef = React.useRef<Record<string, string | null>>({});
  const hoverPreviewRequestsRef = React.useRef(new Set<string>());
  const [items, setItems] = React.useState<VaultEntry[]>([]);
  const [selected, setSelected] = React.useState<VaultEntry | null>(null);
  const [content, setContent] = React.useState("");
  const [savedContent, setSavedContent] = React.useState("");
  const [newNoteTitle, setNewNoteTitle] = React.useState("");
  const [activeFolder, setActiveFolder] = React.useState("all");
  const [editorMode, setEditorMode] = React.useState<EditorMode>("edit");
  const [panelPosition, setPanelPosition] = React.useState<PanelPosition>("right");
  const [theme, setTheme] = React.useState<ThemePreference>("system");
  const [isLoading, setIsLoading] = React.useState(true);
  const [isOpeningNote, setIsOpeningNote] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isCreating, setIsCreating] = React.useState(false);
  const [isUploading, setIsUploading] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [formattingHint, setFormattingHint] = React.useState<FormattingHint | null>(null);
  const [hoverPreview, setHoverPreview] = React.useState<HoverPreview | null>(null);
  const [hoverPreviewContentByPath, setHoverPreviewContentByPath] = React.useState<Record<string, string | null>>({});
  const [activeHeadingId, setActiveHeadingId] = React.useState<string | null>(null);

  React.useEffect(() => {
    const storedTheme = window.localStorage.getItem("archeion-theme");
    if (storedTheme === "light" || storedTheme === "dark" || storedTheme === "system") {
      const frame = window.requestAnimationFrame(() => setTheme(storedTheme));
      return () => window.cancelAnimationFrame(frame);
    }
    return undefined;
  }, []);

  React.useEffect(() => () => {
    if (hoverPreviewTimerRef.current !== null) window.clearTimeout(hoverPreviewTimerRef.current);
  }, []);

  React.useEffect(() => {
    const storedPosition = window.localStorage.getItem("archeion-panel-position");
    if (storedPosition === "left" || storedPosition === "right" || storedPosition === "top" || storedPosition === "bottom") {
      const frame = window.requestAnimationFrame(() => setPanelPosition(storedPosition));
      return () => window.cancelAnimationFrame(frame);
    }
    return undefined;
  }, []);

  React.useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    if (theme !== "system") root.classList.add(theme);
    window.localStorage.setItem("archeion-theme", theme);
  }, [theme]);

  React.useEffect(() => {
    window.localStorage.setItem("archeion-panel-position", panelPosition);
  }, [panelPosition]);

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
  }, []);

  const openItem = React.useCallback(async (item: VaultEntry) => {
    const requestId = ++openRequestRef.current;
    setSelected(item);
    setMessage(null);

    if (item.kind === "attachment") {
      setContent("");
      setSavedContent("");
      setIsOpeningNote(false);
      return;
    }

    setIsOpeningNote(true);
    try {
      const response = await fetch(`/api/vault/note?path=${encodeURIComponent(item.path)}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        if (requestId === openRequestRef.current) {
          setMessage(await readError(response));
          setIsOpeningNote(false);
        }
        return;
      }

      const body = (await response.json()) as { content: string };
      if (requestId === openRequestRef.current) {
        setContent(body.content);
        setSavedContent(body.content);
        setEditorMode("edit");
        setIsOpeningNote(false);
      }
    } catch (error) {
      if (requestId === openRequestRef.current) {
        setMessage(error instanceof Error ? error.message : "Не удалось открыть заметку");
        setIsOpeningNote(false);
      }
    }
  }, []);

  const refreshItems = React.useCallback(async () => {
    const nextItems = await fetchVaultItems();
    setItems(nextItems);
    return nextItems;
  }, []);

  const loadHoverPreview = React.useCallback(async (item: VaultEntry) => {
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
  }, []);

  const cancelHoverPreviewDismissal = React.useCallback(() => {
    if (hoverPreviewTimerRef.current === null) return;
    window.clearTimeout(hoverPreviewTimerRef.current);
    hoverPreviewTimerRef.current = null;
  }, []);

  const scheduleHoverPreviewDismissal = React.useCallback(() => {
    cancelHoverPreviewDismissal();
    hoverPreviewTimerRef.current = window.setTimeout(() => {
      setHoverPreview(null);
      hoverPreviewTimerRef.current = null;
    }, 180);
  }, [cancelHoverPreviewDismissal]);

  const showHoverPreview = React.useCallback((item: VaultEntry, target: HTMLButtonElement) => {
    if (item.kind !== "note") return;

    cancelHoverPreviewDismissal();
    const targetRect = target.getBoundingClientRect();
    const previewWidth = Math.min(672, window.innerWidth - 32);
    const opensToLeft = panelPosition === "right" || (panelPosition !== "left" && targetRect.left > window.innerWidth / 2);
    const left = Math.max(
      16,
      Math.min(
        window.innerWidth - previewWidth - 16,
        opensToLeft ? targetRect.left - previewWidth - 16 : targetRect.right + 16,
      ),
    );
    const top = Math.max(16, Math.min(window.innerHeight - 336, targetRect.top - 16));

    hoverPreviewTimerRef.current = window.setTimeout(() => {
      setHoverPreview({ item, left, top });
      hoverPreviewTimerRef.current = null;
      void loadHoverPreview(item);
    }, 150);
  }, [cancelHoverPreviewDismissal, loadHoverPreview, panelPosition]);

  React.useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const nextItems = await fetchVaultItems();
        if (!active) return;
        setItems(nextItems);
        const firstNote = nextItems.find((item) => item.kind === "note");
        if (firstNote) await openItem(firstNote);
      } catch (error) {
        if (active) {
          setMessage(error instanceof Error ? error.message : "Не удалось открыть Vault");
        }
      } finally {
        if (active) setIsLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [openItem]);

  async function createNote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsCreating(true);
    setMessage(null);

    try {
      const response = await fetch("/api/vault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newNoteTitle }),
      });
      if (!response.ok) throw new Error(await readError(response));

      const body = (await response.json()) as { item: VaultEntry };
      setActiveFolder(parentFolder(body.item.path));
      await refreshItems();
      await openItem(body.item);
      setNewNoteTitle("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось создать заметку");
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
      const response = await fetch("/api/vault/upload", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) throw new Error(await readError(response));

      const body = (await response.json()) as { item: VaultEntry };
      setActiveFolder(parentFolder(body.item.path));
      await refreshItems();
      await openItem(body.item);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось добавить файл");
    } finally {
      setIsUploading(false);
    }
  }

  async function saveNote() {
    if (!selected || selected.kind !== "note") return;

    setIsSaving(true);
    setMessage(null);

    try {
      const response = await fetch("/api/vault/note", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: selected.path, content }),
      });
      if (!response.ok) throw new Error(await readError(response));

      const body = (await response.json()) as { item: VaultEntry };
      setSelected(body.item);
      setItems((current) => current.map((item) => (item.path === body.item.path ? body.item : item)));
      hoverPreviewCacheRef.current[body.item.path] = content;
      setHoverPreviewContentByPath((current) => ({ ...current, [body.item.path]: content }));
      setSavedContent(content);
      setMessage("Изменения сохранены в Markdown-файл");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить заметку");
    } finally {
      setIsSaving(false);
    }
  }

  const updateFormattingHint = React.useCallback(() => {
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
  }, []);

  const applyFormatting = React.useCallback((format: TextFormat) => {
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
  }, []);

  const documentHeadings = React.useMemo(() => extractMarkdownHeadings(content), [content]);
  const currentHeadingId = documentHeadings.some((heading) => heading.id === activeHeadingId)
    ? activeHeadingId
    : documentHeadings[0]?.id ?? null;

  const updateActiveHeadingFromEditor = React.useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    let nextHeading = documentHeadings[0];
    for (const heading of documentHeadings) {
      if (heading.start > textarea.selectionStart) break;
      nextHeading = heading;
    }
    setActiveHeadingId(nextHeading?.id ?? null);
  }, [documentHeadings]);

  const updateActiveHeadingFromPreview = React.useCallback(() => {
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
  }, [documentHeadings, editorMode]);

  React.useEffect(() => {
    if (editorMode === "edit" || documentHeadings.length === 0) return;

    updateActiveHeadingFromPreview();
    window.addEventListener("scroll", updateActiveHeadingFromPreview, { passive: true });
    return () => window.removeEventListener("scroll", updateActiveHeadingFromPreview);
  }, [documentHeadings.length, editorMode, updateActiveHeadingFromPreview]);

  const navigateToHeading = React.useCallback((heading: DocumentHeading) => {
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
  }, [content, editorMode]);

  const folders = collectFolders(items);
  const visibleItems = activeFolder === "all"
    ? items
    : items.filter((item) => parentFolder(item.path) === activeFolder);
  const isDirty = selected?.kind === "note" && content !== savedContent;
  const selectedTitle = selected ? (selected.kind === "note" ? noteTitle(selected) : selected.name) : "";
  const activeFolderTitle = activeFolder === "all" ? "Все файлы" : folderLabel(activeFolder);
  const isHorizontalDock = panelPosition === "top" || panelPosition === "bottom";
  const hoverPreviewContent = hoverPreview ? hoverPreviewContentByPath[hoverPreview.item.path] : undefined;
  const showDocumentOutline = documentHeadings.length > 0 && editorMode !== "split";

  const layout = {
    right: {
      shell: "lg:grid-cols-[minmax(0,1fr)_20rem]",
      panel: "order-1 border-b lg:order-2 lg:border-b-0 lg:border-l",
      canvas: "order-2 lg:order-1",
    },
    left: {
      shell: "lg:grid-cols-[20rem_minmax(0,1fr)]",
      panel: "order-1 border-b lg:border-b-0 lg:border-r",
      canvas: "order-2",
    },
    top: {
      shell: "lg:grid-rows-[auto_minmax(0,1fr)]",
      panel: "order-1 border-b",
      canvas: "order-2",
    },
    bottom: {
      shell: "lg:grid-rows-[minmax(0,1fr)_auto]",
      panel: "order-2 border-t",
      canvas: "order-1",
    },
  }[panelPosition];

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

  return (
    <>
      <main className="min-h-[100dvh] bg-background text-foreground selection:bg-[var(--selection)]">
      <div className={cn("grid min-h-[100dvh]", layout.shell)}>
        <section aria-label="Рабочее полотно" className={cn("grid min-h-[60dvh] min-w-0 grid-rows-[auto_minmax(0,1fr)] bg-[var(--editor)] lg:min-h-0", layout.canvas)}>
          <header className="flex min-h-16 min-w-0 items-center justify-between gap-4 border-b px-4 py-3 md:px-7">
            <div className="min-w-0">
              {selected ? (
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

            {selected?.kind === "note" ? (
              <div className="flex shrink-0 items-center gap-2">
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
                    className={cn("h-7 rounded-[5px] px-2.5 text-xs font-medium text-muted-foreground outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring/70", editorMode === "split" && "bg-background text-foreground shadow-sm")}
                    onClick={() => {
                      setFormattingHint(null);
                      setEditorMode("split");
                    }}
                    role="tab"
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
                  {isSaving ? "Сохранение…" : isDirty ? "Сохранить" : "Сохранено"}
                </Button>
              </div>
            ) : null}
          </header>

          <div
            className="min-h-0 overflow-y-auto"
            onScroll={editorMode === "edit" ? undefined : updateActiveHeadingFromPreview}
            ref={canvasScrollRef}
          >
            <div className="mx-auto min-h-full max-w-5xl px-5 py-7 md:px-12 md:py-11">
              {!isLoading && !selected ? (
                <div className="mx-auto flex max-w-md flex-col items-start pt-14">
                  <span className="grid size-11 place-items-center rounded-lg bg-accent text-accent-foreground">
                    <PlusIcon className="size-5" />
                  </span>
                  <h2 className="mt-5 text-xl font-semibold tracking-[-0.02em]">Создайте первую мысль</h2>
                  <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">Введите имя файла в панели Vault — Archeion создаст переносимую Markdown-заметку.</p>
                </div>
              ) : null}

              {isLoading || isOpeningNote ? <LoadingCanvas /> : null}

              {!isLoading && !isOpeningNote && selected?.kind === "note" ? (
                <div className={cn("relative mx-auto min-h-full", showDocumentOutline ? "max-w-5xl" : "max-w-3xl")}>
                  <div className="min-w-0">
                    <div className="mx-auto flex min-h-full max-w-3xl flex-col">
                      {editorMode === "edit" ? markdownEditor : null}
                      {editorMode === "preview" ? <MarkdownPreview content={content} /> : null}
                      {editorMode === "split" ? (
                        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.85fr)]">
                          <div className="min-w-0">{markdownEditor}</div>
                          <aside aria-label="Быстрый просмотр Markdown" className="min-w-0 border-t pt-6 lg:border-t-0 lg:border-l lg:pl-8 lg:pt-0">
                            <div className="flex items-center justify-between gap-3">
                              <h2 className="text-sm font-semibold tracking-[-0.01em]">Быстрый просмотр</h2>
                              <kbd className="rounded-[4px] border bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">⌘/Ctrl H</kbd>
                            </div>
                            <div className="mt-5"><MarkdownPreview content={content} /></div>
                          </aside>
                        </div>
                      ) : null}
                      <footer className="mt-auto flex items-center gap-3 border-t pt-4 text-xs text-muted-foreground">
                        <span>{wordCount(content)} слов</span>
                        <span aria-hidden="true">·</span>
                        <span>{isDirty ? "Есть несохранённые изменения" : "Все изменения сохранены"}</span>
                      </footer>
                    </div>
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

              {!isLoading && selected?.kind === "attachment" ? (
                <div className="mx-auto flex max-w-xl flex-col items-start pt-14">
                  <span className="grid size-12 place-items-center rounded-lg bg-secondary text-secondary-foreground">
                    <AttachmentIcon className="size-5" />
                  </span>
                  <span className="mt-6 text-xs font-medium text-muted-foreground">Вложение</span>
                  <h2 className="mt-2 break-words text-2xl font-semibold tracking-[-0.03em]">{selected.name}</h2>
                  <p className="mt-3 text-sm text-muted-foreground">{selected.mimeType} · {formatBytes(selected.size)} · добавлен {formatDate(selected.updatedAt)}</p>
                  <Button asChild className="mt-7 rounded-md shadow-none">
                    <a href={`/api/vault/file?path=${encodeURIComponent(selected.path)}`} rel="noreferrer" target="_blank">Открыть файл</a>
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <aside aria-label="Панель Vault" className={cn("flex min-h-0 flex-col bg-sidebar/70", layout.panel, isHorizontalDock ? "lg:max-h-80" : "lg:h-[100dvh]")}>
          <header className="flex min-h-16 items-center justify-between gap-2 border-b px-3">
            <Link className="flex min-w-0 items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/70" href="/">
              <span className="grid size-7 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground">
                <ArcheionMark className="size-4" />
              </span>
              <span className="truncate text-sm font-semibold tracking-[-0.02em]">Vault</span>
            </Link>
            <div className="flex shrink-0 items-center gap-1.5">
              <DockControls onChange={setPanelPosition} position={panelPosition} />
              <ThemeControls onChange={setTheme} theme={theme} />
            </div>
          </header>

          <div className="border-b px-3 py-3">
            <form className="flex gap-2" onSubmit={createNote}>
              <label className="sr-only" htmlFor="note-title">Название новой заметки</label>
              <Input
                className="h-9 rounded-md bg-background px-2.5 text-sm shadow-none"
                id="note-title"
                onChange={(event) => setNewNoteTitle(event.target.value)}
                placeholder="Новая заметка"
                value={newNoteTitle}
              />
              <Button className="h-9 shrink-0 rounded-md px-3 shadow-none" disabled={isCreating} size="sm" type="submit">
                <PlusIcon className="size-4" />
                <span className="sr-only">Создать заметку</span>
              </Button>
            </form>
            <input ref={fileInputRef} className="sr-only" type="file" onChange={uploadFile} />
            <button
              className="mt-2 flex h-8 w-full items-center gap-2 rounded-md px-1.5 text-left text-xs font-medium text-muted-foreground outline-none transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/70"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
              type="button"
            >
              <UploadIcon className="size-3.5" />
              {isUploading ? "Добавляем файл…" : "Добавить файл"}
            </button>
          </div>

          <div aria-busy={isLoading} className={cn("min-h-0 flex-1 overflow-y-auto p-3", isHorizontalDock && "lg:grid lg:grid-cols-[11rem_minmax(0,1fr)] lg:gap-4 lg:overflow-hidden")}>
            {isLoading ? (
              <div className={cn("space-y-2", isHorizontalDock && "lg:col-span-2")}>
                <div className="h-10 animate-pulse rounded-md bg-muted" />
                <div className="h-10 animate-pulse rounded-md bg-muted" />
                <div className="h-10 animate-pulse rounded-md bg-muted" />
              </div>
            ) : null}

            {!isLoading ? (
              <section aria-labelledby="folders-heading" className={cn(isHorizontalDock && "lg:min-h-0 lg:overflow-y-auto lg:border-r lg:pr-3")}>
                <h2 className="mb-1.5 px-1 text-xs font-medium text-muted-foreground" id="folders-heading">Папки</h2>
                <div className="grid gap-0.5">
                  <button
                    aria-current={activeFolder === "all" ? "page" : undefined}
                    className={cn(
                      "flex h-9 items-center gap-2 rounded-md px-2 text-left text-sm outline-none transition-colors duration-150 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/70",
                      activeFolder === "all" && "bg-accent text-accent-foreground",
                    )}
                    onClick={() => setActiveFolder("all")}
                    type="button"
                  >
                    <FolderIcon className="size-4 text-primary" />
                    <span className="flex-1 truncate">Все файлы</span>
                    <span className="text-xs tabular-nums text-muted-foreground">{items.length}</span>
                  </button>
                  {folders.map((folder) => {
                    const count = items.filter((item) => parentFolder(item.path) === folder).length;
                    return (
                      <button
                        aria-current={activeFolder === folder ? "page" : undefined}
                        className={cn(
                          "flex h-9 items-center gap-2 rounded-md px-2 text-left text-sm outline-none transition-colors duration-150 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/70",
                          activeFolder === folder && "bg-accent text-accent-foreground",
                        )}
                        key={folder || "root"}
                        onClick={() => setActiveFolder(folder)}
                        type="button"
                      >
                        <FolderIcon className="size-4 text-muted-foreground" />
                        <span className="flex-1 truncate">{folderLabel(folder)}</span>
                        <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : null}

            {!isLoading ? (
              <section aria-labelledby="files-heading" className={cn("mt-5", isHorizontalDock && "lg:mt-0 lg:min-h-0 lg:overflow-y-auto")}>
                <div className="mb-1.5 flex items-center justify-between px-1">
                  <h2 className="text-xs font-medium text-muted-foreground" id="files-heading">{activeFolderTitle}</h2>
                  <span className="text-xs tabular-nums text-muted-foreground">{visibleItems.length}</span>
                </div>
                {visibleItems.length > 0 ? (
                  <div className="grid gap-0.5">
                    {visibleItems.map((item) => (
                      <button
                        aria-current={selected?.path === item.path ? "page" : undefined}
                        className={cn(
                          "flex min-h-12 items-center gap-2.5 rounded-md px-2 text-left outline-none transition-colors duration-150 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/70",
                          selected?.path === item.path && "bg-accent",
                        )}
                        key={item.path}
                        onBlur={item.kind === "note" ? scheduleHoverPreviewDismissal : undefined}
                        onClick={() => {
                          cancelHoverPreviewDismissal();
                          setHoverPreview(null);
                          void openItem(item);
                        }}
                        onFocus={item.kind === "note" ? (event) => showHoverPreview(item, event.currentTarget) : undefined}
                        onPointerEnter={item.kind === "note" ? (event) => showHoverPreview(item, event.currentTarget) : undefined}
                        onPointerLeave={item.kind === "note" ? scheduleHoverPreviewDismissal : undefined}
                        type="button"
                      >
                        <span className={cn("grid size-7 shrink-0 place-items-center rounded-[5px]", item.kind === "note" ? "bg-primary/10 text-primary" : "bg-secondary text-secondary-foreground")}>
                          {item.kind === "note" ? <NoteIcon className="size-3.5" /> : <AttachmentIcon className="size-3.5" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-foreground">{item.kind === "note" ? noteTitle(item) : item.name}</span>
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{item.kind === "note" ? formatDate(item.updatedAt) : formatBytes(item.size)}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="px-1 py-5">
                    <BookIcon className="size-4 text-muted-foreground" />
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">В этой папке пока нет файлов.</p>
                  </div>
                )}
              </section>
            ) : null}
          </div>
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

      {hoverPreview && typeof document !== "undefined" ? createPortal(
        <aside
          aria-label={`Быстрый просмотр: ${noteTitle(hoverPreview.item)}`}
          className="fixed z-40 w-[calc(100vw-2rem)] max-w-2xl overflow-hidden rounded-[1.25rem] border bg-popover p-4 text-popover-foreground shadow-lg"
          onPointerEnter={cancelHoverPreviewDismissal}
          onPointerLeave={scheduleHoverPreviewDismissal}
          style={{ left: hoverPreview.left, top: hoverPreview.top }}
        >
          <header className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">Быстрый просмотр</p>
              <h2 className="mt-1 truncate text-lg font-semibold tracking-[-0.02em]">{noteTitle(hoverPreview.item)}</h2>
            </div>
            <span className="shrink-0 rounded-[4px] bg-primary/10 px-2 py-1 text-xs font-medium text-primary">Markdown</span>
          </header>

          <div className="mt-4 border-t pt-4">
            {hoverPreviewContent === undefined ? (
              <div aria-busy="true" className="space-y-2.5 py-1">
                <div className="h-4 w-11/12 animate-pulse rounded bg-muted" />
                <div className="h-4 w-full animate-pulse rounded bg-muted" />
                <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
              </div>
            ) : hoverPreviewContent === null ? (
              <p className="py-1 text-[15px] leading-7 text-muted-foreground">Не удалось загрузить содержимое заметки.</p>
            ) : (
              <p className="line-clamp-5 text-[15px] leading-7 text-muted-foreground">
                {markdownExcerpt(hoverPreviewContent) || "В этой заметке пока нет текста."}
              </p>
            )}
          </div>

          <footer className="mt-4 flex items-center justify-between gap-3 border-t pt-3 text-xs text-muted-foreground">
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
        </aside>,
        document.body,
      ) : null}
    </>
  );
}

export { VaultWorkspace };
