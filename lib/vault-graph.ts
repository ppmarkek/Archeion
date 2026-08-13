import "server-only";

import path from "node:path";

import type {
  VaultGraphData,
  VaultGraphEdge,
  VaultGraphFolder,
  VaultGraphNode,
} from "@/lib/vault-graph-types";
import { listVaultItems, readMarkdownNote } from "@/lib/vault";

const MARKDOWN_EXTENSION = /\.md$/i;
const EXTERNAL_PROTOCOL = /^[a-z][a-z\d+.-]*:/i;

function folderFor(notePath: string) {
  const slash = notePath.lastIndexOf("/");
  return slash === -1 ? "" : notePath.slice(0, slash);
}

function folderName(folderPath: string) {
  return folderPath ? path.posix.basename(folderPath) : "Корень";
}

function noteTitle(notePath: string) {
  return path.posix.basename(notePath).replace(MARKDOWN_EXTENSION, "");
}

function normaliseLookupPath(value: string) {
  return path.posix.normalize(value.replaceAll("\\", "/")).replace(/^\.\//, "");
}

function withoutMarkdownExtension(value: string) {
  return value.replace(MARKDOWN_EXTENSION, "");
}

function stripCode(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?```/g, "")
    .replace(/~~~[\s\S]*?~~~/g, "")
    .replace(/`[^`\n]*`/g, "");
}

function cleanLinkTarget(rawTarget: string) {
  let target = rawTarget.trim();
  if (!target) return null;

  if (target.startsWith("<")) {
    const closingBracket = target.indexOf(">");
    target = closingBracket === -1 ? target.slice(1) : target.slice(1, closingBracket);
  } else {
    target = target.split(/\s+["']/u, 1)[0] ?? target;
  }

  try {
    target = decodeURIComponent(target);
  } catch {
    // Keep malformed percent sequences as-is so a local file can still resolve.
  }

  target = target.split("#", 1)[0]?.split("?", 1)[0]?.trim() ?? "";
  if (!target || EXTERNAL_PROTOCOL.test(target) || target.startsWith("//")) return null;

  return normaliseLookupPath(target.replace(/^\/+/, ""));
}

function extractLinkTargets(markdown: string) {
  const content = stripCode(markdown);
  const targets: string[] = [];

  for (const match of content.matchAll(/!?\[\[([^\]]+)\]\]/g)) {
    const target = cleanLinkTarget((match[1] ?? "").split("|", 1)[0] ?? "");
    if (target) targets.push(target);
  }

  for (const match of content.matchAll(/(?<!!)\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = cleanLinkTarget(match[1] ?? "");
    if (target) targets.push(target);
  }

  return targets;
}

function createResolver(notePaths: string[]) {
  const byPath = new Map<string, string>();
  const byBasename = new Map<string, string[]>();

  for (const notePath of notePaths) {
    const withoutExtension = withoutMarkdownExtension(notePath).toLocaleLowerCase("ru");
    byPath.set(notePath.toLocaleLowerCase("ru"), notePath);
    byPath.set(withoutExtension, notePath);

    const basename = path.posix.basename(withoutExtension);
    byBasename.set(basename, [...(byBasename.get(basename) ?? []), notePath]);
  }

  return (sourcePath: string, rawTarget: string) => {
    const target = normaliseLookupPath(rawTarget);
    const sourceFolder = path.posix.dirname(sourcePath) === "." ? "" : path.posix.dirname(sourcePath);
    const relativeTarget = normaliseLookupPath(path.posix.join(sourceFolder, target));
    const candidates = [relativeTarget, target];

    for (const candidate of candidates) {
      const exact = byPath.get(candidate.toLocaleLowerCase("ru"));
      if (exact) return exact;

      const withoutExtension = byPath.get(withoutMarkdownExtension(candidate).toLocaleLowerCase("ru"));
      if (withoutExtension) return withoutExtension;
    }

    const basename = path.posix.basename(withoutMarkdownExtension(target)).toLocaleLowerCase("ru");
    const basenameMatches = byBasename.get(basename);
    return basenameMatches?.length === 1 ? basenameMatches[0] : null;
  };
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

export async function buildVaultGraph(): Promise<VaultGraphData> {
  const notes = (await listVaultItems()).filter((item) => item.kind === "note");
  const resolveTarget = createResolver(notes.map((note) => note.path));
  const edgeKeys = new Set<string>();
  const edges: VaultGraphEdge[] = [];

  const contents = await mapWithConcurrency(notes, 12, async (note) => ({
    note,
    content: await readMarkdownNote(note.path).catch(() => ""),
  }));

  for (const { note, content } of contents) {
    for (const rawTarget of extractLinkTargets(content)) {
      const target = resolveTarget(note.path, rawTarget);
      if (!target || target === note.path) continue;

      const [source, destination] = [note.path, target].sort((left, right) => left.localeCompare(right));
      const edgeKey = `${source}\u0000${destination}`;
      if (edgeKeys.has(edgeKey)) continue;

      edgeKeys.add(edgeKey);
      edges.push({ source, target: destination });
    }
  }

  const nodes: VaultGraphNode[] = notes.map((note) => ({
    id: note.path,
    path: note.path,
    title: noteTitle(note.path),
    folder: folderFor(note.path),
    updatedAt: note.updatedAt,
  }));

  const folderCounts = new Map<string, number>();
  for (const node of nodes) {
    if (!node.folder) {
      folderCounts.set("", (folderCounts.get("") ?? 0) + 1);
      continue;
    }

    const parts = node.folder.split("/");
    for (let index = 1; index <= parts.length; index += 1) {
      const folderPath = parts.slice(0, index).join("/");
      folderCounts.set(folderPath, (folderCounts.get(folderPath) ?? 0) + 1);
    }
  }

  const folders: VaultGraphFolder[] = [...folderCounts.entries()]
    .map(([folderPath, count]) => ({ path: folderPath, name: folderName(folderPath), count }))
    .sort((left, right) => {
      if (!left.path) return -1;
      if (!right.path) return 1;
      return left.path.localeCompare(right.path, "ru");
    });

  return { nodes, edges, folders };
}
