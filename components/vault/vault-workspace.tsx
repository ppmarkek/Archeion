"use client";

import * as React from "react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
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

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
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

function VaultWorkspace() {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [items, setItems] = React.useState<VaultEntry[]>([]);
  const [selected, setSelected] = React.useState<VaultEntry | null>(null);
  const [content, setContent] = React.useState("");
  const [savedContent, setSavedContent] = React.useState("");
  const [newNoteTitle, setNewNoteTitle] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isCreating, setIsCreating] = React.useState(false);
  const [isUploading, setIsUploading] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  const openItem = React.useCallback(async (item: VaultEntry) => {
    setSelected(item);
    setMessage(null);

    if (item.kind === "attachment") {
      setContent("");
      setSavedContent("");
      return;
    }

    const response = await fetch(`/api/vault/note?path=${encodeURIComponent(item.path)}`, {
      cache: "no-store",
    });
    if (!response.ok) {
      setMessage(await readError(response));
      return;
    }

    const body = (await response.json()) as { content: string };
    setContent(body.content);
    setSavedContent(body.content);
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
  const isDirty = selected?.kind === "note" && content !== savedContent;

  return (
    <main className="min-h-[100dvh] bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-4 py-5 md:px-8 md:py-8">
        <header className="flex items-center justify-between gap-4 border-b pb-5">
          <div>
            <Link className="text-sm font-bold tracking-[-0.03em]" href="/">Archeion</Link>
            <p className="mt-1 text-sm text-muted-foreground">Личное хранилище заметок и учебных материалов</p>
          </div>
          <Badge variant="accent">Markdown по умолчанию</Badge>
        </header>

        <section className="mt-6 grid min-h-[calc(100dvh-9rem)] gap-5 lg:grid-cols-[290px_minmax(0,1fr)]">
          <aside className="flex min-h-0 flex-col rounded-2xl border bg-card p-3 shadow-sm">
            <form className="grid gap-2" onSubmit={createNote}>
              <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground" htmlFor="note-title">Новая Markdown-заметка</label>
              <Input id="note-title" value={newNoteTitle} onChange={(event) => setNewNoteTitle(event.target.value)} placeholder="Конспект лекции" />
              <Button type="submit" disabled={isCreating}>{isCreating ? "Создание…" : "Создать .md"}</Button>
            </form>

            <div className="mt-3">
              <input ref={fileInputRef} className="sr-only" type="file" onChange={uploadFile} />
              <Button type="button" className="w-full" variant="outline" disabled={isUploading} onClick={() => fileInputRef.current?.click()}>
                {isUploading ? "Добавление файла…" : "Добавить файл"}
              </Button>
            </div>

            <Separator className="my-5" />

            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Заметки</p>
              <div className="grid gap-1">
                {notes.map((item) => (
                  <button key={item.path} type="button" className={cn("rounded-xl px-3 py-2 text-left transition-colors hover:bg-accent", selected?.path === item.path && "bg-accent text-accent-foreground")} onClick={() => void openItem(item)}>
                    <span className="block truncate text-sm font-medium">{item.name.replace(/\.md$/i, "")}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">{formatDate(item.updatedAt)}</span>
                  </button>
                ))}
              </div>

              <p className="mb-2 mt-6 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Файлы</p>
              <div className="grid gap-1">
                {attachments.length === 0 ? <p className="px-3 py-2 text-sm text-muted-foreground">Файлов пока нет</p> : null}
                {attachments.map((item) => (
                  <button key={item.path} type="button" className={cn("rounded-xl px-3 py-2 text-left transition-colors hover:bg-accent", selected?.path === item.path && "bg-accent text-accent-foreground")} onClick={() => void openItem(item)}>
                    <span className="block truncate text-sm font-medium">{item.name}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">{formatBytes(item.size)}</span>
                  </button>
                ))}
              </div>
            </div>
          </aside>

          <Card className="min-h-0 overflow-hidden">
            {isLoading ? <CardContent className="p-8 text-sm text-muted-foreground">Открываем Vault…</CardContent> : null}
            {!isLoading && !selected ? <CardContent className="p-8 text-sm text-muted-foreground">Создайте Markdown-заметку или добавьте файл, чтобы начать.</CardContent> : null}
            {!isLoading && selected?.kind === "note" ? (
              <>
                <CardHeader className="gap-4 border-b">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-2xl">{selected.name.replace(/\.md$/i, "")}</CardTitle>
                      <p className="mt-1 font-mono text-xs text-muted-foreground">{selected.path}</p>
                    </div>
                    <Button type="button" disabled={!isDirty || isSaving} onClick={() => void saveNote()}>
                      {isSaving ? "Сохранение…" : isDirty ? "Сохранить" : "Сохранено"}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="flex min-h-0 flex-1 p-0">
                  <Textarea aria-label="Редактор Markdown" value={content} onChange={(event) => setContent(event.target.value)} spellCheck className="min-h-[560px] resize-none rounded-none border-0 px-6 py-5 font-mono text-sm leading-7 shadow-none focus-visible:ring-0" />
                </CardContent>
              </>
            ) : null}
            {!isLoading && selected?.kind === "attachment" ? (
              <CardContent className="flex min-h-[400px] items-center p-8">
                <div>
                  <Badge variant="outline">Вложение</Badge>
                  <h1 className="mt-4 text-3xl font-semibold tracking-[-0.05em]">{selected.name}</h1>
                  <p className="mt-3 text-sm text-muted-foreground">{selected.mimeType} · {formatBytes(selected.size)}</p>
                  <Button asChild className="mt-6">
                    <a href={`/api/vault/file?path=${encodeURIComponent(selected.path)}`} target="_blank" rel="noreferrer">Открыть файл</a>
                  </Button>
                </div>
              </CardContent>
            ) : null}
          </Card>
        </section>

        {message ? <p className="mt-4 text-sm text-muted-foreground" role="status">{message}</p> : null}
      </div>
    </main>
  );
}

export { VaultWorkspace };
