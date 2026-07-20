import "server-only";

import { randomUUID } from "node:crypto";
import { access, lstat, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export const MAX_NOTE_BYTES = 2 * 1024 * 1024;

export type VaultItemKind = "note" | "attachment";

export type VaultEntry = {
  path: string;
  name: string;
  kind: VaultItemKind;
  mimeType: string;
  size: number;
  updatedAt: string;
};

export class VaultError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "VaultError";
  }
}

const mimeTypes: Record<string, string> = {
  ".csv": "text/csv",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".json": "application/json",
  ".md": "text/markdown; charset=utf-8",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
};

function vaultRoot() {
  return path.resolve(
    process.env.ARCHEION_VAULT_DIR ?? path.join(process.cwd(), "data", "vault"),
  );
}

function normaliseRelativePath(value: string) {
  if (!value || value.includes("\0") || path.isAbsolute(value)) {
    throw new VaultError(400, "Invalid vault path");
  }

  const normalised = path.posix.normalize(value.replaceAll("\\", "/"));
  if (normalised === "." || normalised === ".." || normalised.startsWith("../")) {
    throw new VaultError(400, "Invalid vault path");
  }

  return normalised;
}

function resolveVaultPath(relativePath: string) {
  const root = vaultRoot();
  const normalised = normaliseRelativePath(relativePath);
  const absolutePath = path.resolve(root, normalised);

  if (!absolutePath.startsWith(`${root}${path.sep}`)) {
    throw new VaultError(400, "Invalid vault path");
  }

  return { absolutePath, relativePath: normalised };
}

async function exists(target: string) {
  try {
    await access(target, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function isMarkdown(relativePath: string) {
  return path.extname(relativePath).toLowerCase() === ".md";
}

function mimeTypeFor(relativePath: string) {
  return mimeTypes[path.extname(relativePath).toLowerCase()] ?? "application/octet-stream";
}

function displayNameFor(relativePath: string) {
  return path.basename(relativePath);
}

function safeFileName(value: string, fallback: string) {
  const name = value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/^\.+/, "")
    .replace(/[. ]+$/, "")
    .slice(0, 160);

  return name || fallback;
}

function noteTitle(value: string | undefined) {
  const cleaned = safeFileName(value ?? "Untitled note", "Untitled note").replace(/\.md$/i, "");
  return cleaned || "Untitled note";
}

async function uniqueRelativePath(directory: string, fileName: string) {
  const extension = path.extname(fileName);
  const stem = path.basename(fileName, extension);
  let counter = 0;
  let candidate = path.posix.join(directory, fileName);

  while (await exists(resolveVaultPath(candidate).absolutePath)) {
    counter += 1;
    candidate = path.posix.join(directory, `${stem} ${counter}${extension}`);
  }

  return candidate;
}

async function entryFromPath(relativePath: string): Promise<VaultEntry> {
  const { absolutePath, relativePath: normalisedPath } = resolveVaultPath(relativePath);

  try {
    const fileStat = await lstat(absolutePath);
    if (!fileStat.isFile()) {
      throw new VaultError(404, "Vault item was not found");
    }

    return {
      path: normalisedPath,
      name: displayNameFor(normalisedPath),
      kind: isMarkdown(normalisedPath) ? "note" : "attachment",
      mimeType: mimeTypeFor(normalisedPath),
      size: fileStat.size,
      updatedAt: fileStat.mtime.toISOString(),
    };
  } catch (error) {
    if (error instanceof VaultError) throw error;
    throw new VaultError(404, "Vault item was not found");
  }
}

async function walkVault(directory: string, relativeDirectory = ""): Promise<VaultEntry[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const items: VaultEntry[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;

    const relativePath = relativeDirectory
      ? path.posix.join(relativeDirectory, entry.name)
      : entry.name;
    const absolutePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      items.push(...(await walkVault(absolutePath, relativePath)));
      continue;
    }

    if (entry.isFile()) {
      items.push(await entryFromPath(relativePath));
    }
  }

  return items;
}

export async function ensureVault() {
  const root = vaultRoot();
  await mkdir(root, { recursive: true });
  await mkdir(path.join(root, "attachments"), { recursive: true });

  const welcomePath = resolveVaultPath("Welcome to Archeion.md").absolutePath;
  if (!(await exists(welcomePath))) {
    await writeFile(
      welcomePath,
      "# Добро пожаловать в Archeion\n\nЭто ваша первая Markdown-заметка. Редактируйте её, создавайте новые заметки и добавляйте учебные материалы в Vault.\n",
      "utf8",
    );
  }

  return root;
}

export async function listVaultItems() {
  const root = await ensureVault();
  const items = await walkVault(root);

  return items.sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === "note" ? -1 : 1;
    return right.updatedAt.localeCompare(left.updatedAt);
  });
}

export async function createMarkdownNote(title?: string) {
  await ensureVault();
  const titleForNote = noteTitle(title);
  const relativePath = await uniqueRelativePath("", `${titleForNote}.md`);
  const { absolutePath } = resolveVaultPath(relativePath);

  await writeFile(absolutePath, `# ${titleForNote}\n\n`, "utf8");
  return entryFromPath(relativePath);
}

export async function addUploadedFile(file: File) {
  const cleanName = safeFileName(file.name, "Untitled file");
  const markdown = isMarkdown(cleanName);
  const maximumSize = markdown ? MAX_NOTE_BYTES : MAX_ATTACHMENT_BYTES;
  if (file.size > maximumSize) {
    throw new VaultError(
      413,
      markdown ? "Markdown files must be 2 MB or smaller" : "Files must be 25 MB or smaller",
    );
  }

  await ensureVault();
  const directory = markdown ? "" : "attachments";
  const relativePath = markdown
    ? await uniqueRelativePath(directory, cleanName)
    : path.posix.join(directory, `${randomUUID()}-${cleanName}`);
  const { absolutePath } = resolveVaultPath(relativePath);

  await writeFile(absolutePath, Buffer.from(await file.arrayBuffer()));
  return entryFromPath(relativePath);
}

export async function readMarkdownNote(relativePath: string) {
  await ensureVault();
  const { absolutePath, relativePath: normalisedPath } = resolveVaultPath(relativePath);
  if (!isMarkdown(normalisedPath)) {
    throw new VaultError(400, "Only Markdown notes can be edited");
  }

  try {
    await entryFromPath(normalisedPath);
    return await readFile(absolutePath, "utf8");
  } catch {
    throw new VaultError(404, "Note was not found");
  }
}

export async function saveMarkdownNote(relativePath: string, content: string) {
  if (Buffer.byteLength(content, "utf8") > MAX_NOTE_BYTES) {
    throw new VaultError(413, "Notes must be 2 MB or smaller");
  }

  await ensureVault();
  const { absolutePath, relativePath: normalisedPath } = resolveVaultPath(relativePath);
  if (!isMarkdown(normalisedPath)) {
    throw new VaultError(400, "Only Markdown notes can be edited");
  }

  await entryFromPath(normalisedPath);

  await writeFile(absolutePath, content, "utf8");
  return entryFromPath(normalisedPath);
}

export async function readVaultFile(relativePath: string) {
  await ensureVault();
  const entry = await entryFromPath(relativePath);
  const { absolutePath } = resolveVaultPath(entry.path);

  return {
    entry,
    data: await readFile(absolutePath),
  };
}
