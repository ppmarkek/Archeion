import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "vitest";

import { withVaultFixture } from "../support/vault-fixture";

test("a Note cannot be created outside the Vault", async () => {
  await withVaultFixture(async ({ outsidePath }) => {
    const { createMarkdownNote } = await import("@/lib/vault");
    const sentinelPath = path.join(outsidePath, "sentinel.txt");
    await writeFile(sentinelPath, "untouched");

    await expect(createMarkdownNote("Escape", "../outside")).rejects.toMatchObject({
      name: "VaultError",
      status: 400,
    });

    await expect(readFile(sentinelPath, "utf8")).resolves.toBe("untouched");
  });
});
