import type { VaultItem, VaultSearchResult } from "@/components/vault/vault-types";

export type VaultFolder = {
  path: string;
  name: string;
  kind: "folder";
  updatedAt: string;
};

export type VaultSnapshot = {
  items: VaultItem[];
  folders: VaultFolder[];
};

type VaultSnapshotResponse = {
  items: VaultItem[];
  folders?: VaultFolder[];
};

export type VaultPathChange = {
  from: string;
  to: string;
};

export type VaultMutation = {
  oldPath: string;
  newPath: string;
  pathChanges: VaultPathChange[];
  item?: VaultItem;
  folder?: VaultFolder;
};

export type VaultDeleteResult = {
  deletedPath: string;
  kind: VaultItem["kind"] | "folder";
};

export type VaultCreateInput = {
  directory: string;
  name: string;
};

export interface VaultPort {
  listSnapshot(): Promise<VaultSnapshot>;
  readNote(path: string): Promise<string>;
  saveNote(path: string, content: string): Promise<VaultItem>;
  createNote(input: VaultCreateInput): Promise<VaultItem>;
  createFolder(input: VaultCreateInput): Promise<VaultFolder>;
  upload(file: Blob, directory: string): Promise<VaultItem>;
  rename(path: string, name: string): Promise<VaultMutation>;
  move(path: string, destination: string): Promise<VaultMutation>;
  delete(path: string): Promise<VaultDeleteResult>;
  search(query: string): Promise<readonly VaultSearchResult[]>;
}

type FetchImpl = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type ApiError = {
  error?: unknown;
};

/** A semantic operation failure that any VaultPort adapter may surface. */
export class VaultOperationError extends Error {
  readonly retryable: boolean;
  readonly status: number;

  constructor(message: string, options: { retryable: boolean; status: number }) {
    super(message);
    this.name = "VaultOperationError";
    this.retryable = options.retryable;
    this.status = options.status;
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

async function readJson<T>(fetchImpl: FetchImpl, input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetchImpl(input, init);
  if (!response.ok) {
    throw new VaultOperationError(await readError(response), {
      retryable: true,
      status: response.status,
    });
  }
  return (await response.json()) as T;
}

function deriveFolders(items: readonly VaultItem[]): VaultFolder[] {
  const paths = new Set<string>();
  for (const item of items) {
    const parts = item.path.split("/");
    for (let index = 1; index < parts.length; index += 1) {
      paths.add(parts.slice(0, index).join("/"));
    }
  }

  return [...paths]
    .sort((left, right) => left.localeCompare(right, "ru"))
    .map((path) => {
      const name = path.split("/").at(-1) ?? path;
      return {
        kind: "folder" as const,
        name: name === "attachments" ? "Вложения" : name,
        path,
        updatedAt: "",
      };
    });
}

export function createHttpVaultAdapter(fetchImpl: FetchImpl = fetch): VaultPort {
  return {
    async listSnapshot() {
      const snapshot = await readJson<VaultSnapshotResponse>(fetchImpl, "/api/vault", { cache: "no-store" });
      return {
        items: snapshot.items,
        folders: snapshot.folders ?? deriveFolders(snapshot.items),
      };
    },

    async readNote(path) {
      const body = await readJson<{ content: string }>(
        fetchImpl,
        `/api/vault/note?path=${encodeURIComponent(path)}`,
        { cache: "no-store" },
      );
      return body.content;
    },

    async saveNote(path, content) {
      const body = await readJson<{ item: VaultItem }>(fetchImpl, "/api/vault/note", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, content }),
      });
      return body.item;
    },

    async createNote({ directory, name }) {
      const body = await readJson<{ item: VaultItem }>(fetchImpl, "/api/vault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ directory, title: name, type: "note" }),
      });
      return body.item;
    },

    async createFolder({ directory, name }) {
      const body = await readJson<{ folder: VaultFolder }>(fetchImpl, "/api/vault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ directory, name, type: "folder" }),
      });
      return body.folder;
    },

    async upload(file, directory) {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("directory", directory);
      const body = await readJson<{ item: VaultItem }>(fetchImpl, "/api/vault/upload", {
        method: "POST",
        body: formData,
      });
      return body.item;
    },

    async rename(path, name) {
      return readJson<VaultMutation>(fetchImpl, "/api/vault/item", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, path }),
      });
    },

    async move(path, destination) {
      return readJson<VaultMutation>(fetchImpl, "/api/vault/item", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destination, path }),
      });
    },

    async delete(path) {
      return readJson<VaultDeleteResult>(fetchImpl, "/api/vault/item", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
    },

    async search(query) {
      const body = await readJson<{ results: VaultSearchResult[] }>(
        fetchImpl,
        `/api/vault/search?q=${encodeURIComponent(query)}`,
        { cache: "no-store" },
      );
      return body.results;
    },
  };
}
