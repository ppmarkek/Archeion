import { expect, test } from "vitest";

import { withVaultFixture } from "../support/vault-fixture";

test("a new Vault starts with the welcome Note and lists it as a Note", async () => {
  await withVaultFixture(async () => {
    const { listVault } = await import("@/lib/vault");

    await expect(listVault()).resolves.toMatchObject({
      folders: [],
      items: [
        expect.objectContaining({
          kind: "note",
          name: "Welcome to Archeion.md",
          path: "Welcome to Archeion.md",
        }),
      ],
    });
  });
});

test("a Note can be created, read, and saved through the public Vault API", async () => {
  await withVaultFixture(async () => {
    const { createMarkdownNote, readMarkdownNote, saveMarkdownNote } = await import("@/lib/vault");

    const created = await createMarkdownNote("Study notes");
    expect(created).toMatchObject({
      kind: "note",
      name: "Study notes.md",
      path: "Study notes.md",
    });
    await expect(readMarkdownNote(created.path)).resolves.toBe("# Study notes\n\n");

    const saved = await saveMarkdownNote(created.path, "# Study notes\n\nUpdated body");
    expect(saved).toMatchObject({
      kind: "note",
      name: "Study notes.md",
      path: "Study notes.md",
    });
    await expect(readMarkdownNote(created.path)).resolves.toBe("# Study notes\n\nUpdated body");
  });
});

test("renaming a folder reports descendant path changes", async () => {
  await withVaultFixture(async () => {
    const { createMarkdownNote, createVaultFolder, readMarkdownNote, renameVaultItem } = await import("@/lib/vault");

    const folder = await createVaultFolder("Research");
    const note = await createMarkdownNote("Draft", folder.path);

    const result = await renameVaultItem(folder.path, "Archive");

    expect(result).toMatchObject({
      oldPath: "Research",
      newPath: "Archive",
      pathChanges: [
        { from: "Research", to: "Archive" },
        { from: "Research/Draft.md", to: "Archive/Draft.md" },
      ],
    });
    await expect(readMarkdownNote("Archive/Draft.md")).resolves.toBe("# Draft\n\n");
    await expect(readMarkdownNote(note.path)).rejects.toMatchObject({ status: 404 });
  });
});

test("moving a Note returns its old and new paths", async () => {
  await withVaultFixture(async () => {
    const { createMarkdownNote, createVaultFolder, moveVaultItem, readMarkdownNote } = await import("@/lib/vault");

    const source = await createVaultFolder("Inbox");
    const destination = await createVaultFolder("Archive");
    const note = await createMarkdownNote("Draft", source.path);

    const result = await moveVaultItem(note.path, destination.path);

    expect(result).toMatchObject({
      oldPath: "Inbox/Draft.md",
      newPath: "Archive/Draft.md",
      pathChanges: [{ from: "Inbox/Draft.md", to: "Archive/Draft.md" }],
    });
    await expect(readMarkdownNote("Archive/Draft.md")).resolves.toBe("# Draft\n\n");
  });
});

test("renaming to an existing Vault item reports a conflict", async () => {
  await withVaultFixture(async () => {
    const { createMarkdownNote, renameVaultItem } = await import("@/lib/vault");

    await createMarkdownNote("Alpha");
    const beta = await createMarkdownNote("Beta");

    await expect(renameVaultItem(beta.path, "Alpha.md")).rejects.toMatchObject({
      name: "VaultError",
      status: 409,
    });
  });
});

test("search ranks exact names before prefixes and content matches", async () => {
  await withVaultFixture(async () => {
    const { createMarkdownNote, saveMarkdownNote, searchVault } = await import("@/lib/vault");

    const exact = await createMarkdownNote("Roadmap");
    const prefix = await createMarkdownNote("Roadmap draft");
    const content = await createMarkdownNote("Reference");
    await saveMarkdownNote(content.path, "A roadmap appears in this body.");

    const results = await searchVault("roadmap");

    expect(results.map((result) => [result.item.path, result.match])).toEqual([
      [exact.path, "name"],
      [prefix.path, "name"],
      [content.path, "content"],
    ]);
  });
});

test("saving a Note invalidates stale content search results", async () => {
  await withVaultFixture(async () => {
    const { createMarkdownNote, saveMarkdownNote, searchVault } = await import("@/lib/vault");

    const note = await createMarkdownNote("Cache check");
    await saveMarkdownNote(note.path, "old marker");
    expect((await searchVault("old marker")).map((result) => result.item.path)).toContain(note.path);

    await saveMarkdownNote(note.path, "new marker");

    expect(await searchVault("old marker")).toEqual([]);
    expect((await searchVault("new marker")).map((result) => result.item.path)).toContain(note.path);
  });
});
