import "server-only";

import {
  access,
  lstat,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { constants } from "node:fs";
import type { Dirent, Stats } from "node:fs";
import path from "node:path";

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export const MAX_NOTE_BYTES = 2 * 1024 * 1024;

const MAX_PATH_BYTES = 1024;
const MAX_SEARCH_QUERY_LENGTH = 200;
const MAX_SEARCH_RESULTS = 100;
const MAX_SEARCHABLE_TEXT_BYTES = MAX_NOTE_BYTES;
const SEARCH_CACHE_MAX_BYTES = 32 * 1024 * 1024;
const SEARCH_CACHE_MAX_ENTRY_BYTES = MAX_NOTE_BYTES;

export type VaultItemKind = "note" | "attachment";

export type VaultEntry = {
  path: string;
  name: string;
  kind: VaultItemKind;
  mimeType: string;
  size: number;
  updatedAt: string;
};

export type VaultFolderEntry = {
  path: string;
  name: string;
  kind: "folder";
  updatedAt: string;
};

export type VaultPathChange = {
  from: string;
  to: string;
};

export type VaultMutationResult = {
  oldPath: string;
  newPath: string;
  pathChanges: VaultPathChange[];
  item?: VaultEntry;
  folder?: VaultFolderEntry;
};

export type VaultSearchResult = {
  item: VaultEntry;
  match: "name" | "path" | "content";
  snippet?: string;
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
  ".csv": "text/csv; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".xml": "application/xml; charset=utf-8",
  ".yaml": "application/yaml; charset=utf-8",
  ".yml": "application/yaml; charset=utf-8",
};

const searchableTextExtensions = new Set([
  ".csv",
  ".html",
  ".json",
  ".md",
  ".txt",
  ".xml",
  ".yaml",
  ".yml",
]);

type SearchCacheEntry = {
  signature: string;
  content: string;
  normalisedContent: string;
  bytes: number;
};

const searchCache = new Map<string, SearchCacheEntry>();
let searchCacheBytes = 0;
let mutationQueue: Promise<void> = Promise.resolve();

function vaultRoot() {
  return path.resolve(
    process.env.ARCHEION_VAULT_DIR ?? path.join(process.cwd(), "data", "vault"),
  );
}

function isFileSystemError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function throwFileSystemError(error: unknown, fallback: string): never {
  if (error instanceof VaultError) throw error;

  if (isFileSystemError(error)) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") {
      throw new VaultError(404, "Файл или папка не найдены");
    }

    if (error.code === "EEXIST" || error.code === "ENOTEMPTY") {
      throw new VaultError(409, "В этой папке уже есть объект с таким именем");
    }

    if (error.code === "EACCES" || error.code === "EPERM") {
      throw new VaultError(403, "Недостаточно прав для этой операции");
    }

    if (error.code === "ENAMETOOLONG") {
      throw new VaultError(400, "Слишком длинный путь или имя");
    }
  }

  throw new VaultError(500, fallback);
}

function normaliseRelativePath(value: string, allowRoot = false) {
  if (typeof value !== "string" || value.includes("\0")) {
    throw new VaultError(400, "Некорректный путь в Vault");
  }

  const slashPath = value.replaceAll("\\", "/");
  if (
    slashPath.startsWith("/")
    || slashPath.startsWith("//")
    || /^[a-z]:\//iu.test(slashPath)
  ) {
    throw new VaultError(400, "Абсолютные пути недоступны в Vault");
  }

  if (Buffer.byteLength(slashPath, "utf8") > MAX_PATH_BYTES) {
    throw new VaultError(400, "Слишком длинный путь");
  }

  const parts = slashPath.split("/").filter((part) => part !== "" && part !== ".");
  if (parts.some((part) => part === "..")) {
    throw new VaultError(400, "Путь не может выходить за пределы Vault");
  }

  if (parts.some((part) => part.startsWith("."))) {
    throw new VaultError(400, "Скрытые файлы и папки недоступны через Vault");
  }

  if (parts.some((part) => Buffer.byteLength(part, "utf8") > 255)) {
    throw new VaultError(400, "Слишком длинное имя файла или папки");
  }

  const normalised = parts.join("/");
  if (!normalised && !allowRoot) {
    throw new VaultError(400, "Укажите путь в Vault");
  }

  return normalised;
}

function normaliseDirectoryPath(value: string | undefined) {
  return normaliseRelativePath(value ?? "", true);
}

function resolveVaultPath(relativePath: string, allowRoot = false) {
  const root = vaultRoot();
  const normalised = normaliseRelativePath(relativePath, allowRoot);
  const absolutePath = normalised ? path.resolve(root, normalised) : root;

  if (absolutePath !== root && !absolutePath.startsWith(`${root}${path.sep}`)) {
    throw new VaultError(400, "Путь не может выходить за пределы Vault");
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

async function lstatOrNull(target: string): Promise<Stats | null> {
  try {
    return await lstat(target);
  } catch (error) {
    if (isFileSystemError(error) && error.code === "ENOENT") return null;
    throw error;
  }
}

async function assertSafeExistingPath(relativePath: string) {
  const { absolutePath, relativePath: normalisedPath } = resolveVaultPath(relativePath);
  const root = vaultRoot();
  const parts = normalisedPath.split("/");
  let current = root;
  let currentStat: Stats | null = null;

  for (let index = 0; index < parts.length; index += 1) {
    current = path.join(current, parts[index]);

    try {
      currentStat = await lstat(current);
    } catch (error) {
      throwFileSystemError(error, "Не удалось проверить путь в Vault");
    }

    if (currentStat.isSymbolicLink()) {
      throw new VaultError(400, "Символические ссылки недоступны через Vault");
    }

    if (index < parts.length - 1 && !currentStat.isDirectory()) {
      throw new VaultError(404, "Папка в указанном пути не найдена");
    }
  }

  if (!currentStat) {
    throw new VaultError(404, "Файл или папка не найдены");
  }

  return { absolutePath, relativePath: normalisedPath, fileStat: currentStat };
}

async function assertDirectory(relativePath: string | undefined) {
  const normalisedPath = normaliseDirectoryPath(relativePath);

  if (!normalisedPath) {
    const root = await ensureVault();
    const rootStat = await stat(root).catch((error) => {
      throwFileSystemError(error, "Не удалось открыть Vault");
    });
    if (!rootStat.isDirectory()) {
      throw new VaultError(500, "Путь Vault не является папкой");
    }
    return { absolutePath: root, relativePath: "" };
  }

  const resolved = await assertSafeExistingPath(normalisedPath);
  if (!resolved.fileStat.isDirectory()) {
    throw new VaultError(400, "Выбранный путь не является папкой");
  }

  return resolved;
}

function isMarkdown(relativePath: string) {
  return path.extname(relativePath).toLowerCase() === ".md";
}

function isSearchableText(relativePath: string) {
  return searchableTextExtensions.has(path.extname(relativePath).toLowerCase());
}

function mimeTypeFor(relativePath: string) {
  return mimeTypes[path.extname(relativePath).toLowerCase()] ?? "application/octet-stream";
}

function displayNameFor(relativePath: string) {
  return path.posix.basename(relativePath);
}

function safeFileName(value: string, fallback: string) {
  let name = value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/^\.+/, "")
    .replace(/[. ]+$/, "")
    .slice(0, 160);

  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu.test(name)) {
    name = `_${name}`;
  }

  return name || fallback;
}

function validateEntryName(value: string, type: "file" | "folder") {
  const name = value;
  const typeLabel = type === "folder" ? "папки" : "файла";

  if (!name.trim()) {
    throw new VaultError(400, `Введите имя ${typeLabel}`);
  }

  if (
    name === "."
    || name === ".."
    || name.startsWith(".")
    || name.startsWith(" ")
    || name.endsWith(".")
    || name.endsWith(" ")
    || /[<>:"/\\|?*\u0000-\u001f]/u.test(name)
  ) {
    throw new VaultError(400, `Имя ${typeLabel} содержит недопустимые символы`);
  }

  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu.test(name)) {
    throw new VaultError(400, `Это имя ${typeLabel} зарезервировано системой`);
  }

  if (Buffer.byteLength(name, "utf8") > 255) {
    throw new VaultError(400, `Слишком длинное имя ${typeLabel}`);
  }

  return name;
}

function noteTitle(value: string | undefined) {
  const cleaned = safeFileName(value ?? "Untitled note", "Untitled note").replace(/\.md$/i, "");
  return cleaned || "Untitled note";
}

function entryFromStat(relativePath: string, fileStat: Stats): VaultEntry {
  return {
    path: relativePath,
    name: displayNameFor(relativePath),
    kind: isMarkdown(relativePath) ? "note" : "attachment",
    mimeType: mimeTypeFor(relativePath),
    size: fileStat.size,
    updatedAt: fileStat.mtime.toISOString(),
  };
}

function folderFromStat(
  relativePath: string,
  fileStat: Stats,
): VaultFolderEntry {
  return {
    path: relativePath,
    name: displayNameFor(relativePath),
    kind: "folder",
    updatedAt: fileStat.mtime.toISOString(),
  };
}

async function entryFromPath(relativePath: string): Promise<VaultEntry> {
  const resolved = await assertSafeExistingPath(relativePath);
  if (!resolved.fileStat.isFile()) {
    throw new VaultError(404, "Файл не найден");
  }

  return entryFromStat(resolved.relativePath, resolved.fileStat);
}

async function folderFromPath(relativePath: string): Promise<VaultFolderEntry> {
  const resolved = await assertSafeExistingPath(relativePath);
  if (!resolved.fileStat.isDirectory()) {
    throw new VaultError(404, "Папка не найдена");
  }

  return folderFromStat(resolved.relativePath, resolved.fileStat);
}

async function walkVault(
  directory: string,
  relativeDirectory = "",
): Promise<{ items: VaultEntry[]; folders: VaultFolderEntry[] }> {
  let directoryEntries: Dirent<string>[];

  try {
    directoryEntries = await readdir(directory, { encoding: "utf8", withFileTypes: true });
  } catch (error) {
    throwFileSystemError(error, "Не удалось прочитать содержимое Vault");
  }

  const items: VaultEntry[] = [];
  const folders: VaultFolderEntry[] = [];

  for (const directoryEntry of directoryEntries) {
    if (directoryEntry.name.startsWith(".") || directoryEntry.isSymbolicLink()) continue;

    const relativePath = relativeDirectory
      ? path.posix.join(relativeDirectory, directoryEntry.name)
      : directoryEntry.name;
    const absolutePath = path.join(directory, directoryEntry.name);
    const fileStat = await lstatOrNull(absolutePath);
    if (!fileStat || fileStat.isSymbolicLink()) continue;

    if (fileStat.isDirectory()) {
      folders.push(folderFromStat(relativePath, fileStat));
      const children = await walkVault(absolutePath, relativePath);
      items.push(...children.items);
      folders.push(...children.folders);
      continue;
    }

    if (fileStat.isFile()) {
      items.push(entryFromStat(relativePath, fileStat));
    }
  }

  return { items, folders };
}

async function writeUniqueFile(directory: string, fileName: string, data: string | Buffer) {
  const extension = path.extname(fileName);
  const stem = path.basename(fileName, extension);

  for (let counter = 0; counter < 10_000; counter += 1) {
    const candidateName = counter === 0 ? fileName : `${stem} ${counter}${extension}`;
    const relativePath = directory
      ? path.posix.join(directory, candidateName)
      : candidateName;
    const { absolutePath } = resolveVaultPath(relativePath);

    try {
      await writeFile(absolutePath, data, { flag: "wx" });
      invalidateSearchCache(relativePath);
      return await entryFromPath(relativePath);
    } catch (error) {
      if (isFileSystemError(error) && error.code === "EEXIST") continue;
      throwFileSystemError(error, "Не удалось создать файл");
    }
  }

  throw new VaultError(409, "Не удалось подобрать свободное имя файла");
}

function withVaultMutation<T>(operation: () => Promise<T>) {
  const result = mutationQueue.then(operation, operation);
  mutationQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function invalidateSearchCache(pathPrefix: string) {
  for (const [cachePath, cached] of searchCache) {
    if (cachePath === pathPrefix || cachePath.startsWith(`${pathPrefix}/`)) {
      searchCache.delete(cachePath);
      searchCacheBytes -= cached.bytes;
    }
  }
}

function cacheSearchContent(pathKey: string, value: SearchCacheEntry) {
  if (value.bytes > SEARCH_CACHE_MAX_ENTRY_BYTES) return;

  const previous = searchCache.get(pathKey);
  if (previous) searchCacheBytes -= previous.bytes;
  searchCache.delete(pathKey);
  searchCache.set(pathKey, value);
  searchCacheBytes += value.bytes;

  while (searchCacheBytes > SEARCH_CACHE_MAX_BYTES) {
    const oldest = searchCache.entries().next().value as [string, SearchCacheEntry] | undefined;
    if (!oldest) break;
    searchCache.delete(oldest[0]);
    searchCacheBytes -= oldest[1].bytes;
  }
}

function normaliseSearchValue(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("ru");
}

function findAllTerms(value: string, terms: string[]) {
  let firstIndex = Number.POSITIVE_INFINITY;

  for (const term of terms) {
    const index = value.indexOf(term);
    if (index === -1) return null;
    firstIndex = Math.min(firstIndex, index);
  }

  return Number.isFinite(firstIndex) ? firstIndex : null;
}

function contentSnippet(content: string, matchIndex: number, matchLength: number) {
  const start = Math.max(0, matchIndex - 72);
  const end = Math.min(content.length, matchIndex + matchLength + 128);
  const text = content
    .slice(start, end)
    .replace(/\s+/gu, " ")
    .trim();

  return `${start > 0 ? "…" : ""}${text}${end < content.length ? "…" : ""}`;
}

async function mapWithConcurrency<T, R>(
  values: T[],
  limit: number,
  mapper: (value: T) => Promise<R>,
) {
  const results = new Array<R>(values.length);
  let cursor = 0;

  async function worker() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(values[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return results;
}

async function searchableContent(item: VaultEntry) {
  if (!isSearchableText(item.path) || item.size > MAX_SEARCHABLE_TEXT_BYTES) return null;

  const signature = `${item.size}:${item.updatedAt}`;
  const cached = searchCache.get(item.path);
  if (cached?.signature === signature) {
    searchCache.delete(item.path);
    searchCache.set(item.path, cached);
    return cached;
  }

  const { absolutePath } = resolveVaultPath(item.path);
  let content: string;
  try {
    content = await readFile(absolutePath, "utf8");
  } catch {
    return null;
  }

  const entry: SearchCacheEntry = {
    signature,
    content,
    normalisedContent: normaliseSearchValue(content),
    bytes: Buffer.byteLength(content, "utf8"),
  };
  cacheSearchContent(item.path, entry);
  return entry;
}

async function collectMovedPaths(
  absolutePath: string,
  oldPath: string,
  newPath: string,
  isDirectory: boolean,
) {
  const changes: VaultPathChange[] = [{ from: oldPath, to: newPath }];
  if (!isDirectory) return changes;

  async function visit(directory: string, oldDirectory: string, newDirectory: string) {
    const entries = await readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.isSymbolicLink()) continue;

      const oldChild = path.posix.join(oldDirectory, entry.name);
      const newChild = path.posix.join(newDirectory, entry.name);
      changes.push({ from: oldChild, to: newChild });

      if (entry.isDirectory()) {
        await visit(path.join(directory, entry.name), oldChild, newChild);
      }
    }
  }

  await visit(absolutePath, oldPath, newPath);
  return changes;
}

async function moveOrRenameVaultItem(
  relativePath: string,
  operation: { name: string } | { destination: string },
): Promise<VaultMutationResult> {
  return withVaultMutation(async () => {
    await ensureVault();
    const source = await assertSafeExistingPath(relativePath);
    const isDirectory = source.fileStat.isDirectory();
    const isFile = source.fileStat.isFile();
    if (!isDirectory && !isFile) {
      throw new VaultError(400, "Этот объект нельзя переместить или переименовать");
    }

    let nextName = path.posix.basename(source.relativePath);
    let destination = path.posix.dirname(source.relativePath);
    if (destination === ".") destination = "";

    if ("name" in operation) {
      nextName = validateEntryName(operation.name, isDirectory ? "folder" : "file");

      if (isFile && isMarkdown(source.relativePath)) {
        const extension = path.posix.extname(nextName);
        if (!extension) {
          nextName = `${nextName}.md`;
        } else if (extension.toLowerCase() !== ".md") {
          throw new VaultError(400, "Расширение Markdown-заметки должно оставаться .md");
        }
      }
    } else {
      destination = normaliseDirectoryPath(operation.destination);
      if (
        isDirectory
        && (destination === source.relativePath || destination.startsWith(`${source.relativePath}/`))
      ) {
        throw new VaultError(400, "Нельзя переместить папку внутрь неё самой");
      }
      await assertDirectory(destination);
    }

    const newPath = destination ? path.posix.join(destination, nextName) : nextName;
    const resolvedTarget = resolveVaultPath(newPath);
    if (newPath === source.relativePath) {
      if ("destination" in operation) {
        return isDirectory
          ? {
              oldPath: source.relativePath,
              newPath,
              pathChanges: [],
              folder: folderFromStat(source.relativePath, source.fileStat),
            }
          : {
              oldPath: source.relativePath,
              newPath,
              pathChanges: [],
              item: entryFromStat(source.relativePath, source.fileStat),
            };
      }

      throw new VaultError(400, "Имя не изменилось");
    }

    const targetStat = await lstatOrNull(resolvedTarget.absolutePath);
    const sameObject = targetStat
      && targetStat.dev === source.fileStat.dev
      && targetStat.ino === source.fileStat.ino;
    if (targetStat && !sameObject) {
      throw new VaultError(409, "В этой папке уже есть объект с таким именем");
    }

    const pathChanges = await collectMovedPaths(
      source.absolutePath,
      source.relativePath,
      newPath,
      isDirectory,
    );

    try {
      await rename(source.absolutePath, resolvedTarget.absolutePath);
    } catch (error) {
      throwFileSystemError(error, "Не удалось переместить или переименовать объект");
    }

    invalidateSearchCache(source.relativePath);

    if (isDirectory) {
      return {
        oldPath: source.relativePath,
        newPath,
        pathChanges,
        folder: await folderFromPath(newPath),
      };
    }

    return {
      oldPath: source.relativePath,
      newPath,
      pathChanges,
      item: await entryFromPath(newPath),
    };
  });
}

export async function ensureVault() {
  const root = vaultRoot();
  const rootExisted = await exists(root);

  try {
    await mkdir(root, { recursive: true });
    const rootStat = await stat(root);
    if (!rootStat.isDirectory()) {
      throw new VaultError(500, "Путь Vault не является папкой");
    }
  } catch (error) {
    throwFileSystemError(error, "Не удалось подготовить Vault");
  }

  if (!rootExisted) {
    const welcomePath = path.join(root, "Welcome to Archeion.md");
    try {
      await writeFile(
        welcomePath,
        "# Добро пожаловать в Archeion\n\nЭто ваша первая Markdown-заметка. Редактируйте её, создавайте новые заметки и добавляйте учебные материалы в Vault.\n",
        { encoding: "utf8", flag: "wx" },
      );
    } catch (error) {
      if (!isFileSystemError(error) || error.code !== "EEXIST") {
        throwFileSystemError(error, "Не удалось создать приветственную заметку");
      }
    }
  }

  return root;
}

export async function listVault() {
  const root = await ensureVault();
  const result = await walkVault(root);

  result.items.sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === "note" ? -1 : 1;
    const byName = left.name.localeCompare(right.name, "ru", { sensitivity: "base" });
    return byName || left.path.localeCompare(right.path, "ru", { sensitivity: "base" });
  });
  result.folders.sort((left, right) => left.path.localeCompare(right.path, "ru", {
    sensitivity: "base",
  }));

  const currentPaths = new Set(result.items.map((item) => item.path));
  for (const [cachePath, cached] of searchCache) {
    if (!currentPaths.has(cachePath)) {
      searchCache.delete(cachePath);
      searchCacheBytes -= cached.bytes;
    }
  }

  return result;
}

export async function listVaultItems() {
  return (await listVault()).items;
}

export async function listVaultFolders() {
  return (await listVault()).folders;
}

export async function createMarkdownNote(title?: string, directory = "") {
  return withVaultMutation(async () => {
    await ensureVault();
    const targetDirectory = await assertDirectory(directory);
    const titleForNote = noteTitle(title);
    return writeUniqueFile(
      targetDirectory.relativePath,
      `${titleForNote}.md`,
      `# ${titleForNote}\n\n`,
    );
  });
}

export async function createVaultFolder(name: string, directory = "") {
  return withVaultMutation(async () => {
    await ensureVault();
    const targetDirectory = await assertDirectory(directory);
    const folderName = validateEntryName(name, "folder");
    const relativePath = targetDirectory.relativePath
      ? path.posix.join(targetDirectory.relativePath, folderName)
      : folderName;
    const { absolutePath } = resolveVaultPath(relativePath);

    try {
      await mkdir(absolutePath);
    } catch (error) {
      throwFileSystemError(error, "Не удалось создать папку");
    }

    return folderFromPath(relativePath);
  });
}

export async function addUploadedFile(file: File, directory = "") {
  const cleanName = safeFileName(file.name, "Untitled file");
  const markdown = isMarkdown(cleanName);
  const maximumSize = markdown ? MAX_NOTE_BYTES : MAX_ATTACHMENT_BYTES;
  if (file.size > maximumSize) {
    throw new VaultError(
      413,
      markdown
        ? "Markdown-файл должен быть не больше 2 МБ"
        : "Файл должен быть не больше 25 МБ",
    );
  }

  return withVaultMutation(async () => {
    await ensureVault();
    const targetDirectory = await assertDirectory(directory);
    return writeUniqueFile(
      targetDirectory.relativePath,
      cleanName,
      Buffer.from(await file.arrayBuffer()),
    );
  });
}

export async function readMarkdownNote(relativePath: string) {
  await ensureVault();
  const { absolutePath, relativePath: normalisedPath } = resolveVaultPath(relativePath);
  if (!isMarkdown(normalisedPath)) {
    throw new VaultError(400, "Редактировать можно только Markdown-заметки");
  }

  await entryFromPath(normalisedPath);

  try {
    return await readFile(absolutePath, "utf8");
  } catch (error) {
    throwFileSystemError(error, "Не удалось прочитать заметку");
  }
}

export async function saveMarkdownNote(relativePath: string, content: string) {
  if (Buffer.byteLength(content, "utf8") > MAX_NOTE_BYTES) {
    throw new VaultError(413, "Заметка должна быть не больше 2 МБ");
  }

  return withVaultMutation(async () => {
    await ensureVault();
    const { absolutePath, relativePath: normalisedPath } = resolveVaultPath(relativePath);
    if (!isMarkdown(normalisedPath)) {
      throw new VaultError(400, "Редактировать можно только Markdown-заметки");
    }

    await entryFromPath(normalisedPath);

    try {
      await writeFile(absolutePath, content, "utf8");
    } catch (error) {
      throwFileSystemError(error, "Не удалось сохранить заметку");
    }

    invalidateSearchCache(normalisedPath);
    return entryFromPath(normalisedPath);
  });
}

export async function readVaultFile(relativePath: string) {
  await ensureVault();
  const entry = await entryFromPath(relativePath);
  const { absolutePath } = resolveVaultPath(entry.path);

  try {
    return {
      entry,
      data: await readFile(absolutePath),
    };
  } catch (error) {
    throwFileSystemError(error, "Не удалось прочитать файл");
  }
}

export async function renameVaultItem(relativePath: string, name: string) {
  return moveOrRenameVaultItem(relativePath, { name });
}

export async function moveVaultItem(relativePath: string, destination: string) {
  return moveOrRenameVaultItem(relativePath, { destination });
}

export async function deleteVaultItem(relativePath: string) {
  return withVaultMutation(async () => {
    await ensureVault();
    const source = await assertSafeExistingPath(relativePath);
    const kind = source.fileStat.isDirectory()
      ? "folder"
      : source.fileStat.isFile() && isMarkdown(source.relativePath)
        ? "note"
        : source.fileStat.isFile()
          ? "attachment"
          : null;

    if (!kind) {
      throw new VaultError(400, "Этот объект нельзя удалить");
    }

    try {
      await rm(source.absolutePath, {
        force: false,
        recursive: kind === "folder",
      });
    } catch (error) {
      throwFileSystemError(error, "Не удалось удалить объект");
    }

    invalidateSearchCache(source.relativePath);
    return { deletedPath: source.relativePath, kind };
  });
}

export async function searchVault(query: string, requestedLimit = 50) {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return [];
  if (trimmedQuery.length > MAX_SEARCH_QUERY_LENGTH) {
    throw new VaultError(400, `Поисковый запрос должен быть не длиннее ${MAX_SEARCH_QUERY_LENGTH} символов`);
  }

  const limit = Math.max(1, Math.min(MAX_SEARCH_RESULTS, Math.trunc(requestedLimit) || 50));
  const normalisedQuery = normaliseSearchValue(trimmedQuery).replace(/\.md$/iu, "");
  const terms = [...new Set(normalisedQuery.split(/\s+/u).filter(Boolean))];
  const items = await listVaultItems();

  const candidates = await mapWithConcurrency(items, 8, async (item) => {
    const normalisedName = normaliseSearchValue(item.name.replace(/\.md$/iu, ""));
    const normalisedPath = normaliseSearchValue(item.path.replace(/\.md$/iu, ""));
    const nameIndex = findAllTerms(normalisedName, terms);
    if (nameIndex !== null) {
      const exact = normalisedName === normalisedQuery;
      const prefix = normalisedName.startsWith(normalisedQuery);
      return {
        result: { item, match: "name" as const },
        score: exact ? 400 : prefix ? 350 : 300,
      };
    }

    const pathIndex = findAllTerms(normalisedPath, terms);
    if (pathIndex !== null) {
      return {
        result: { item, match: "path" as const, snippet: item.path },
        score: normalisedPath.startsWith(normalisedQuery) ? 260 : 220,
      };
    }

    const searchable = await searchableContent(item);
    if (!searchable) return null;
    const contentIndex = findAllTerms(searchable.normalisedContent, terms);
    if (contentIndex === null) return null;

    return {
      result: {
        item,
        match: "content" as const,
        snippet: contentSnippet(searchable.content, contentIndex, terms[0]?.length ?? 0),
      },
      score: searchable.normalisedContent.startsWith(normalisedQuery) ? 180 : 120,
    };
  });

  return candidates
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
    .sort((left, right) => {
      if (left.score !== right.score) return right.score - left.score;
      return left.result.item.path.localeCompare(right.result.item.path, "ru", {
        sensitivity: "base",
      });
    })
    .slice(0, limit)
    .map(({ result }) => result satisfies VaultSearchResult);
}
