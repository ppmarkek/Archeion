"use client";

import Link from "next/link";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ArcheionMark,
  AttachmentIcon,
  BookIcon,
  CollectionIcon,
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

type WorkspaceFilter = "all" | "notes" | "attachments";
type EditorMode = "edit" | "preview";
type ThemePreference = "light" | "system" | "dark";

const themeOptions = [
  { value: "light", label: "Светлая тема", Icon: SunIcon },
  { value: "system", label: "Как в системе", Icon: MonitorIcon },
  { value: "dark", label: "Тёмная тема", Icon: MoonIcon },
] as const;

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

function MarkdownPreview({ content }: { content: string }) {
  const blocks = content
    .trim()
    .split(/\n\s*\n/)
    .filter(Boolean);

  if (blocks.length === 0) {
    return <p className="pt-5 text-[15px] leading-7 text-muted-foreground">В этой заметке пока нет текста.</p>;
  }

  return (
    <article aria-label="Предпросмотр Markdown" className="max-w-3xl text-[16px] leading-8 text-foreground">
      {blocks.map((block, index) => {
        const blockKey = `${index}-${block}`;
        const lines = block.split("\n");
        const heading = lines[0]?.match(/^(#{1,3})\s+(.+)$/);

        if (heading) {
          const level = heading[1].length;
          const title = heading[2];
          if (level === 1) {
            return <h2 className="mb-5 mt-1 text-[2rem] font-semibold tracking-[-0.03em] text-foreground" key={blockKey}>{title}</h2>;
          }
          if (level === 2) {
            return <h3 className="mb-3 mt-9 text-[1.45rem] font-semibold tracking-[-0.02em] text-foreground" key={blockKey}>{title}</h3>;
          }
          return <h4 className="mb-2 mt-7 text-lg font-semibold text-foreground" key={blockKey}>{title}</h4>;
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
  const openRequestRef = React.useRef(0);
  const [items, setItems] = React.useState<VaultEntry[]>([]);
  const [selected, setSelected] = React.useState<VaultEntry | null>(null);
  const [content, setContent] = React.useState("");
  const [savedContent, setSavedContent] = React.useState("");
  const [newNoteTitle, setNewNoteTitle] = React.useState("");
  const [filter, setFilter] = React.useState<WorkspaceFilter>("all");
  const [editorMode, setEditorMode] = React.useState<EditorMode>("edit");
  const [theme, setTheme] = React.useState<ThemePreference>("system");
  const [isLoading, setIsLoading] = React.useState(true);
  const [isOpeningNote, setIsOpeningNote] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isCreating, setIsCreating] = React.useState(false);
  const [isUploading, setIsUploading] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    const storedTheme = window.localStorage.getItem("archeion-theme");
    if (storedTheme === "light" || storedTheme === "dark" || storedTheme === "system") {
      const frame = window.requestAnimationFrame(() => setTheme(storedTheme));
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
      setFilter("notes");
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
      setFilter(body.item.kind === "note" ? "notes" : "attachments");
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
      setSavedContent(content);
      setMessage("Изменения сохранены в Markdown-файл");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить заметку");
    } finally {
      setIsSaving(false);
    }
  }

  const notes = items.filter((item) => item.kind === "note");
  const attachments = items.filter((item) => item.kind === "attachment");
  const visibleNotes = filter === "attachments" ? [] : notes;
  const visibleAttachments = filter === "notes" ? [] : attachments;
  const isDirty = selected?.kind === "note" && content !== savedContent;
  const selectedTitle = selected ? (selected.kind === "note" ? noteTitle(selected) : selected.name) : "";

  const filters: Array<{
    id: WorkspaceFilter;
    label: string;
    count: number;
    Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  }> = [
    { id: "all", label: "Всё", count: items.length, Icon: CollectionIcon },
    { id: "notes", label: "Заметки", count: notes.length, Icon: NoteIcon },
    { id: "attachments", label: "Материалы", count: attachments.length, Icon: AttachmentIcon },
  ];

  return (
    <main className="min-h-[100dvh] bg-background text-foreground selection:bg-[var(--selection)]">
      <div className="grid min-h-[100dvh] lg:grid-cols-[14.25rem_18.5rem_minmax(0,1fr)]">
        <aside className="hidden min-h-0 flex-col border-r bg-sidebar lg:flex">
          <div className="flex h-16 items-center border-b px-4">
            <Link className="flex items-center gap-2.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/70" href="/">
              <span className="grid size-8 place-items-center rounded-md bg-primary text-primary-foreground">
                <ArcheionMark className="size-5" />
              </span>
              <span className="text-sm font-semibold tracking-[-0.02em]">Archeion</span>
            </Link>
          </div>

          <nav aria-label="Содержимое Vault" className="px-3 py-5">
            <p className="mb-2 px-2 text-xs font-medium text-muted-foreground">Мой Vault</p>
            <div className="grid gap-1">
              {filters.map(({ id, label, count, Icon }) => (
                <button
                  aria-current={filter === id ? "page" : undefined}
                  className={cn(
                    "flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm text-muted-foreground outline-none transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/70",
                    filter === id && "bg-accent text-accent-foreground",
                  )}
                  key={id}
                  onClick={() => setFilter(id)}
                  type="button"
                >
                  <Icon className="size-4" />
                  <span className="flex-1 text-left">{label}</span>
                  <span className="text-xs tabular-nums opacity-70">{count}</span>
                </button>
              ))}
            </div>
          </nav>

          <div className="mt-auto border-t px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium">Личный режим</p>
                <p className="mt-1 text-xs leading-4 text-muted-foreground">Файлы принадлежат вашему Vault.</p>
              </div>
              <ThemeControls onChange={setTheme} theme={theme} />
            </div>
          </div>
        </aside>

        <section aria-label="Библиотека Vault" className="flex min-h-0 flex-col border-b bg-sidebar/60 lg:border-b-0 lg:border-r">
          <header className="flex h-16 items-center justify-between border-b px-4">
            <div>
              <p className="text-sm font-semibold">Библиотека</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{filter === "all" ? "Все элементы" : filter === "notes" ? "Markdown-заметки" : "Вложения и источники"}</p>
            </div>
            <div className="lg:hidden">
              <ThemeControls onChange={setTheme} theme={theme} />
            </div>
          </header>

          <div className="border-b px-4 py-3">
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
                <span className="sr-only sm:not-sr-only">Создать</span>
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
              {isUploading ? "Добавляем файл…" : "Добавить файл в Vault"}
            </button>
          </div>

          <div aria-busy={isLoading} className="min-h-0 max-h-72 flex-none overflow-y-auto px-2 py-3 lg:max-h-none lg:flex-1">
            {isLoading ? (
              <div className="space-y-2 px-2 py-1">
                <div className="h-10 animate-pulse rounded-md bg-muted" />
                <div className="h-10 animate-pulse rounded-md bg-muted" />
                <div className="h-10 animate-pulse rounded-md bg-muted" />
              </div>
            ) : null}

            {!isLoading && visibleNotes.length > 0 ? (
              <section aria-labelledby="notes-heading" className="mb-5">
                <h2 className="mb-1.5 px-2 text-xs font-medium text-muted-foreground" id="notes-heading">Заметки</h2>
                <div className="grid gap-0.5">
                  {visibleNotes.map((item) => (
                    <button
                      aria-current={selected?.path === item.path ? "page" : undefined}
                      className={cn(
                        "group flex min-h-12 items-center gap-2.5 rounded-md px-2.5 text-left outline-none transition-colors duration-150 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/70",
                        selected?.path === item.path && "bg-accent",
                      )}
                      key={item.path}
                      onClick={() => void openItem(item)}
                      type="button"
                    >
                      <span className="grid size-7 shrink-0 place-items-center rounded-[5px] bg-primary/10 text-primary">
                        <NoteIcon className="size-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">{noteTitle(item)}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">{formatDate(item.updatedAt)}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            {!isLoading && visibleAttachments.length > 0 ? (
              <section aria-labelledby="attachments-heading">
                <h2 className="mb-1.5 px-2 text-xs font-medium text-muted-foreground" id="attachments-heading">Материалы</h2>
                <div className="grid gap-0.5">
                  {visibleAttachments.map((item) => (
                    <button
                      aria-current={selected?.path === item.path ? "page" : undefined}
                      className={cn(
                        "group flex min-h-12 items-center gap-2.5 rounded-md px-2.5 text-left outline-none transition-colors duration-150 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/70",
                        selected?.path === item.path && "bg-accent",
                      )}
                      key={item.path}
                      onClick={() => void openItem(item)}
                      type="button"
                    >
                      <span className="grid size-7 shrink-0 place-items-center rounded-[5px] bg-secondary text-secondary-foreground">
                        <AttachmentIcon className="size-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">{item.name}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">{formatBytes(item.size)}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            {!isLoading && visibleNotes.length === 0 && visibleAttachments.length === 0 ? (
              <div className="px-2 py-8 text-center">
                <BookIcon className="mx-auto size-5 text-muted-foreground" />
                <p className="mt-3 text-sm font-medium">Здесь пока пусто</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">Создайте Markdown-заметку или добавьте материал.</p>
              </div>
            ) : null}
          </div>
        </section>

        <section aria-label="Рабочее полотно" className="grid min-h-[58dvh] min-w-0 grid-rows-[auto_minmax(0,1fr)] bg-[var(--editor)] lg:min-h-0">
          <header className="flex min-h-16 items-center justify-between gap-4 border-b px-4 py-3 md:px-7">
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
                <p className="text-sm text-muted-foreground">Выберите заметку или материал</p>
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

          <div className="min-h-0 overflow-y-auto">
            <div className="mx-auto min-h-full max-w-5xl px-5 py-7 md:px-12 md:py-11">
              {!isLoading && !selected ? (
                <div className="mx-auto flex max-w-md flex-col items-start pt-14">
                  <span className="grid size-11 place-items-center rounded-lg bg-accent text-accent-foreground">
                    <PlusIcon className="size-5" />
                  </span>
                  <h2 className="mt-5 text-xl font-semibold tracking-[-0.02em]">Создайте первую мысль</h2>
                  <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">Введите название слева — Archeion создаст переносимый Markdown-файл, который можно открыть и вне приложения.</p>
                </div>
              ) : null}

              {isLoading || isOpeningNote ? <LoadingCanvas /> : null}

              {!isLoading && !isOpeningNote && selected?.kind === "note" ? (
                <div className="mx-auto flex min-h-full max-w-3xl flex-col">
                  {editorMode === "edit" ? (
                    <Textarea
                      aria-label="Редактор Markdown"
                      className="min-h-[calc(100dvh-15rem)] resize-none rounded-none border-0 bg-transparent px-0 py-0 font-mono text-[15px] leading-7 shadow-none focus-visible:ring-0 md:min-h-[calc(100dvh-13rem)]"
                      onChange={(event) => setContent(event.target.value)}
                      spellCheck
                      value={content}
                    />
                  ) : (
                    <MarkdownPreview content={content} />
                  )}
                  <footer className="mt-auto flex items-center gap-3 border-t pt-4 text-xs text-muted-foreground">
                    <span>{wordCount(content)} слов</span>
                    <span aria-hidden="true">·</span>
                    <span>{isDirty ? "Есть несохранённые изменения" : "Все изменения сохранены"}</span>
                  </footer>
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
      </div>

      {message ? (
        <p className="fixed bottom-5 right-5 z-50 max-w-sm rounded-md bg-foreground px-3 py-2 text-sm text-background shadow-lg" role="status">
          {message}
        </p>
      ) : null}
    </main>
  );
}

export { VaultWorkspace };
