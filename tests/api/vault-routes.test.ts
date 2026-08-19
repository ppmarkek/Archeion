import { expect, test } from "vitest";

import { withVaultFixture } from "../support/vault-fixture";

test("a Note created through the Vault route can be read through the Note route", async () => {
  await withVaultFixture(async () => {
    const vaultRoute = await import("@/app/api/vault/route");
    const noteRoute = await import("@/app/api/vault/note/route");
    const createResponse = await vaultRoute.POST(new Request("http://archeion.test/api/vault", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "note", title: "API contract" }),
    }));

    expect(createResponse.status).toBe(201);
    const created = await createResponse.json() as { item: { path: string } };

    const readResponse = await noteRoute.GET(new Request(
      `http://archeion.test/api/vault/note?path=${encodeURIComponent(created.item.path)}`,
    ));

    expect(readResponse.status).toBe(200);
    await expect(readResponse.json()).resolves.toEqual({
      content: "# API contract\n\n",
    });
  });
});

test("the Vault route rejects a directory outside the Vault", async () => {
  await withVaultFixture(async () => {
    const { POST } = await import("@/app/api/vault/route");
    const response = await POST(new Request("http://archeion.test/api/vault", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "note",
        title: "Blocked",
        directory: "../outside",
      }),
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Путь не может выходить за пределы Vault",
    });
  });
});

test("saving a Note updates content search results", async () => {
  await withVaultFixture(async () => {
    const vaultRoute = await import("@/app/api/vault/route");
    const noteRoute = await import("@/app/api/vault/note/route");
    const searchRoute = await import("@/app/api/vault/search/route");
    const createResponse = await vaultRoute.POST(new Request("http://archeion.test/api/vault", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "note", title: "Search contract" }),
    }));
    const created = await createResponse.json() as { item: { path: string } };

    const saveResponse = await noteRoute.PUT(new Request("http://archeion.test/api/vault/note", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: created.item.path,
        content: "# Search contract\n\namberneedle",
      }),
    }));
    expect(saveResponse.status).toBe(200);

    const firstSearch = await searchRoute.GET(new Request(
      "http://archeion.test/api/vault/search?q=amberneedle",
    ));
    const firstPayload = await firstSearch.json() as { results: Array<{ item: { path: string } }> };
    expect(firstPayload.results.map((result) => result.item.path)).toContain(created.item.path);

    await noteRoute.PUT(new Request("http://archeion.test/api/vault/note", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: created.item.path,
        content: "# Search contract\n\ncobaltlongneedle",
      }),
    }));

    const staleSearch = await searchRoute.GET(new Request(
      "http://archeion.test/api/vault/search?q=amberneedle",
    ));
    const stalePayload = await staleSearch.json() as { results: unknown[] };
    expect(stalePayload.results).toHaveLength(0);

    const updatedSearch = await searchRoute.GET(new Request(
      "http://archeion.test/api/vault/search?q=cobaltlongneedle",
    ));
    const updatedPayload = await updatedSearch.json() as {
      results: Array<{ item: { path: string } }>;
    };
    expect(updatedPayload.results.map((result) => result.item.path)).toContain(created.item.path);
  });
});

test("renaming a folder reports path changes for its Notes", async () => {
  await withVaultFixture(async () => {
    const vaultRoute = await import("@/app/api/vault/route");
    const itemRoute = await import("@/app/api/vault/item/route");

    await vaultRoute.POST(new Request("http://archeion.test/api/vault", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "folder", name: "Course" }),
    }));
    await vaultRoute.POST(new Request("http://archeion.test/api/vault", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "note", title: "Lesson", directory: "Course" }),
    }));

    const renameResponse = await itemRoute.PATCH(new Request(
      "http://archeion.test/api/vault/item",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: "Course", name: "Archive" }),
      },
    ));

    expect(renameResponse.status).toBe(200);
    const renamed = await renameResponse.json() as {
      newPath: string;
      pathChanges: Array<{ from: string; to: string }>;
    };
    expect(renamed).toMatchObject({ newPath: "Archive" });
    expect(renamed.pathChanges).toEqual(expect.arrayContaining([
      { from: "Course", to: "Archive" },
      { from: "Course/Lesson.md", to: "Archive/Lesson.md" },
    ]));
  });
});

test("moving and deleting a Note through the item route persists in the Vault list", async () => {
  await withVaultFixture(async () => {
    const vaultRoute = await import("@/app/api/vault/route");
    const itemRoute = await import("@/app/api/vault/item/route");

    for (const name of ["Inbox", "Archive"]) {
      const response = await vaultRoute.POST(new Request("http://archeion.test/api/vault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "folder", name }),
      }));
      expect(response.status).toBe(201);
    }

    const createResponse = await vaultRoute.POST(new Request("http://archeion.test/api/vault", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "note", title: "Transfer", directory: "Inbox" }),
    }));
    expect(createResponse.status).toBe(201);

    const moveResponse = await itemRoute.PATCH(new Request(
      "http://archeion.test/api/vault/item",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: "Inbox/Transfer.md", destination: "Archive" }),
      },
    ));
    expect(moveResponse.status).toBe(200);
    await expect(moveResponse.json()).resolves.toMatchObject({
      oldPath: "Inbox/Transfer.md",
      newPath: "Archive/Transfer.md",
    });

    const movedListResponse = await vaultRoute.GET();
    const movedList = await movedListResponse.json() as {
      items: Array<{ path: string }>;
    };
    expect(movedList.items.map((item) => item.path)).toContain("Archive/Transfer.md");
    expect(movedList.items.map((item) => item.path)).not.toContain("Inbox/Transfer.md");

    const deleteResponse = await itemRoute.DELETE(new Request(
      "http://archeion.test/api/vault/item",
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: "Archive/Transfer.md" }),
      },
    ));
    expect(deleteResponse.status).toBe(200);

    const deletedListResponse = await vaultRoute.GET();
    const deletedList = await deletedListResponse.json() as {
      items: Array<{ path: string }>;
    };
    expect(deletedList.items.map((item) => item.path)).not.toContain("Archive/Transfer.md");
  });
});

test("uploaded HTML is served as a sandboxed download", async () => {
  await withVaultFixture(async () => {
    const uploadRoute = await import("@/app/api/vault/upload/route");
    const fileRoute = await import("@/app/api/vault/file/route");
    const formData = new FormData();
    formData.set("file", new File(
      ["<script>window.parent.postMessage('unsafe', '*')</script>"],
      "unsafe.html",
      { type: "text/html" },
    ));

    const uploadResponse = await uploadRoute.POST(new Request(
      "http://archeion.test/api/vault/upload",
      { method: "POST", body: formData },
    ));
    expect(uploadResponse.status).toBe(201);
    const uploaded = await uploadResponse.json() as { item: { path: string } };

    const fileResponse = await fileRoute.GET(new Request(
      `http://archeion.test/api/vault/file?path=${encodeURIComponent(uploaded.item.path)}`,
    ));

    expect(fileResponse.status).toBe(200);
    expect(fileResponse.headers.get("content-disposition")).toMatch(/^attachment;/u);
    expect(fileResponse.headers.get("content-security-policy")).toBe("default-src 'none'; sandbox");
    expect(fileResponse.headers.get("x-content-type-options")).toBe("nosniff");
  });
});

test("the Note route reports the Markdown size limit", async () => {
  await withVaultFixture(async () => {
    const vaultRoute = await import("@/app/api/vault/route");
    const noteRoute = await import("@/app/api/vault/note/route");
    const { MAX_NOTE_BYTES } = await import("@/lib/vault");
    const createResponse = await vaultRoute.POST(new Request("http://archeion.test/api/vault", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "note", title: "Oversized" }),
    }));
    const created = await createResponse.json() as { item: { path: string } };

    const response = await noteRoute.PUT(new Request("http://archeion.test/api/vault/note", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: created.item.path,
        content: "x".repeat(MAX_NOTE_BYTES + 1),
      }),
    }));

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: "Заметка должна быть не больше 2 МБ",
    });
  });
});
