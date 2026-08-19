import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { vi } from "vitest";

const SANDBOX_PREFIX = "archeion-vault-test-";

export type VaultFixture = {
  sandboxPath: string;
  vaultPath: string;
  outsidePath: string;
};

function restoreEnvironment(name: "ARCHEION_VAULT_DIR" | "DATABASE_URL", value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

async function removeSandbox(sandboxPath: string) {
  if (
    path.dirname(sandboxPath) !== os.tmpdir()
    || !path.basename(sandboxPath).startsWith(SANDBOX_PREFIX)
  ) {
    throw new Error(`Refusing to remove unsafe test path: ${sandboxPath}`);
  }

  await rm(sandboxPath, { recursive: true, force: true });
}

export async function withVaultFixture<Result>(
  run: (fixture: VaultFixture) => Promise<Result>,
): Promise<Result> {
  const previousVaultDirectory = process.env.ARCHEION_VAULT_DIR;
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const sandboxPath = await mkdtemp(path.join(os.tmpdir(), SANDBOX_PREFIX));
  const vaultPath = path.join(sandboxPath, "vault");
  const outsidePath = path.join(sandboxPath, "outside");

  process.env.ARCHEION_VAULT_DIR = vaultPath;
  delete process.env.DATABASE_URL;

  try {
    await mkdir(outsidePath);
    vi.resetModules();
    return await run({ sandboxPath, vaultPath, outsidePath });
  } finally {
    restoreEnvironment("ARCHEION_VAULT_DIR", previousVaultDirectory);
    restoreEnvironment("DATABASE_URL", previousDatabaseUrl);
    vi.resetModules();
    await removeSandbox(sandboxPath);
  }
}
