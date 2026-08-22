import { expect, test } from "vitest";

import { createHttpVaultAdapter, VaultOperationError } from "@/components/vault/vault-client";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("lists the Vault snapshot without using a cached response", async () => {
  const snapshot = {
    folders: [{ path: "Research", name: "Research", kind: "folder", updatedAt: "" }],
    items: [{
      path: "Research/Notes.md",
      name: "Notes.md",
      kind: "note",
      mimeType: "text/markdown; charset=utf-8",
      size: 10,
      updatedAt: "2026-08-21T00:00:00.000Z",
    }],
  };

  const vault = createHttpVaultAdapter(async (input, init) => {
    expect(input).toBe("/api/vault");
    expect(init).toMatchObject({ cache: "no-store" });
    return jsonResponse(snapshot);
  });

  await expect(vault.listSnapshot()).resolves.toEqual(snapshot);
});

test("derives folder entries when an older snapshot omits the folders field", async () => {
  const items = [{
    path: "Research/Week 1/Notes.md",
    name: "Notes.md",
    kind: "note" as const,
    mimeType: "text/markdown; charset=utf-8",
    size: 10,
    updatedAt: "2026-08-21T00:00:00.000Z",
  }, {
    path: "attachments/source.pdf",
    name: "source.pdf",
    kind: "attachment" as const,
    mimeType: "application/pdf",
    size: 20,
    updatedAt: "2026-08-21T00:00:00.000Z",
  }];
  const vault = createHttpVaultAdapter(async () => jsonResponse({ items }));

  await expect(vault.listSnapshot()).resolves.toEqual({
    items,
    folders: [
      { kind: "folder", name: "Вложения", path: "attachments", updatedAt: "" },
      { kind: "folder", name: "Research", path: "Research", updatedAt: "" },
      { kind: "folder", name: "Week 1", path: "Research/Week 1", updatedAt: "" },
    ],
  });
});

test("reads and saves a note using the note route contracts", async () => {
  const note = {
    path: "Research/Notes.md",
    name: "Notes.md",
    kind: "note" as const,
    mimeType: "text/markdown; charset=utf-8",
    size: 12,
    updatedAt: "2026-08-21T00:00:00.000Z",
  };
  const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const vault = createHttpVaultAdapter(async (input, init) => {
    requests.push({ input, init });
    if (String(input).startsWith("/api/vault/note?")) {
      expect(init).toMatchObject({ cache: "no-store" });
      return jsonResponse({ content: "# Notes" });
    }

    expect(input).toBe("/api/vault/note");
    expect(init).toMatchObject({
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: note.path, content: "# Notes\n\nUpdated" }),
    });
    return jsonResponse({ item: note });
  });

  await expect(vault.readNote(note.path)).resolves.toBe("# Notes");
  await expect(vault.saveNote(note.path, "# Notes\n\nUpdated")).resolves.toEqual(note);
  expect(requests).toHaveLength(2);
});

test("creates notes and folders and uploads a file to their requested directory", async () => {
  const note = {
    path: "Research/Plan.md",
    name: "Plan.md",
    kind: "note" as const,
    mimeType: "text/markdown; charset=utf-8",
    size: 9,
    updatedAt: "2026-08-21T00:00:00.000Z",
  };
  const folder = {
    path: "Research",
    name: "Research",
    kind: "folder" as const,
    updatedAt: "2026-08-21T00:00:00.000Z",
  };
  const attachment = { ...note, path: "Research/source.pdf", name: "source.pdf", kind: "attachment" as const, mimeType: "application/pdf" };
  const vault = createHttpVaultAdapter(async (input, init) => {
    if (input === "/api/vault/upload") {
      expect(init?.method).toBe("POST");
      expect(init?.body).toBeInstanceOf(FormData);
      const formData = init?.body as FormData;
      expect(formData.get("directory")).toBe("Research");
      expect(formData.get("file")).toBeInstanceOf(Blob);
      return jsonResponse({ item: attachment }, 201);
    }

    expect(input).toBe("/api/vault");
    expect(init).toMatchObject({ method: "POST", headers: { "Content-Type": "application/json" } });
    const body = JSON.parse(String(init?.body));
    if (body.type === "folder") {
      expect(body).toEqual({ directory: "", name: "Research", type: "folder" });
      return jsonResponse({ folder }, 201);
    }

    expect(body).toEqual({ directory: "Research", title: "Plan", type: "note" });
    return jsonResponse({ item: note }, 201);
  });

  await expect(vault.createFolder({ directory: "", name: "Research" })).resolves.toEqual(folder);
  await expect(vault.createNote({ directory: "Research", name: "Plan" })).resolves.toEqual(note);
  await expect(vault.upload(new Blob(["pdf"]), "Research")).resolves.toEqual(attachment);
});

test("renames, moves, deletes, and searches through the item and search routes", async () => {
  const mutation = {
    oldPath: "Draft.md",
    newPath: "Research/Plan.md",
    pathChanges: [{ from: "Draft.md", to: "Research/Plan.md" }],
  };
  const deleted = { deletedPath: "Research/Old.md", kind: "note" as const };
  const results = [{
    item: {
      path: "Research/Plan.md",
      name: "Plan.md",
      kind: "note" as const,
      mimeType: "text/markdown; charset=utf-8",
      size: 10,
      updatedAt: "2026-08-21T00:00:00.000Z",
    },
    match: "name" as const,
  }];
  const vault = createHttpVaultAdapter(async (input, init) => {
    if (input === "/api/vault/search?q=roadmap%2Fplan") {
      expect(init).toMatchObject({ cache: "no-store" });
      return jsonResponse({ query: "roadmap/plan", results });
    }

    expect(input).toBe("/api/vault/item");
    expect(init?.headers).toEqual({ "Content-Type": "application/json" });
    const body = JSON.parse(String(init?.body));
    if (init?.method === "DELETE") {
      expect(body).toEqual({ path: "Research/Old.md" });
      return jsonResponse(deleted);
    }
    expect(init?.method).toBe("PATCH");
    if (body.name) expect(body).toEqual({ name: "Plan", path: "Draft.md" });
    else expect(body).toEqual({ destination: "Research", path: "Draft.md" });
    return jsonResponse(mutation);
  });

  await expect(vault.rename("Draft.md", "Plan")).resolves.toEqual(mutation);
  await expect(vault.move("Draft.md", "Research")).resolves.toEqual(mutation);
  await expect(vault.delete("Research/Old.md")).resolves.toEqual(deleted);
  await expect(vault.search("roadmap/plan")).resolves.toEqual(results);
});

test("uses the API error message, including nested error objects", async () => {
  const vault = createHttpVaultAdapter(async () => jsonResponse({ error: { message: "Нет доступа" } }, 403));

  const request = vault.readNote("Private.md");
  await expect(request).rejects.toThrow("Нет доступа");
  await expect(request).rejects.toMatchObject({ retryable: true, status: 403 });
  await expect(request).rejects.toBeInstanceOf(VaultOperationError);
});
