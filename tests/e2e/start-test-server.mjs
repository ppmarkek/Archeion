import { cp, mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const SANDBOX_PREFIX = "archeion-e2e-";
const sourceRoot = fileURLToPath(new URL("../../", import.meta.url));
const port = process.env.ARCHEION_E2E_PORT ?? "3217";
const sandboxPath = await mkdtemp(path.join(os.tmpdir(), SANDBOX_PREFIX));
const vaultPath = path.join(sandboxPath, "vault");
const runtimeRoot = path.join(sandboxPath, "project");
const nextBinary = path.join(sourceRoot, "node_modules", "next", "dist", "bin", "next");
const runtimeEntries = [
  "app",
  "components",
  "db",
  "lib",
  "public",
  "next.config.ts",
  "next-env.d.ts",
  "package.json",
  "postcss.config.mjs",
  "tsconfig.json",
];

async function removeSandbox() {
  if (
    path.dirname(sandboxPath) !== os.tmpdir()
    || !path.basename(sandboxPath).startsWith(SANDBOX_PREFIX)
  ) {
    throw new Error(`Refusing to remove unsafe e2e path: ${sandboxPath}`);
  }

  await rm(sandboxPath, { recursive: true, force: true });
}

try {
  await mkdir(runtimeRoot);
  await Promise.all(runtimeEntries.map((entry) => cp(
    path.join(sourceRoot, entry),
    path.join(runtimeRoot, entry),
    { recursive: true },
  )));
  await symlink(
    path.join(sourceRoot, "node_modules"),
    path.join(runtimeRoot, "node_modules"),
    process.platform === "win32" ? "junction" : "dir",
  );
} catch (error) {
  await removeSandbox();
  throw error;
}

const nextProcess = spawn(
  process.execPath,
  [nextBinary, "dev", "--webpack", "--hostname", "127.0.0.1", "--port", port],
  {
    cwd: runtimeRoot,
    env: {
      ...process.env,
      ARCHEION_VAULT_DIR: vaultPath,
      DATABASE_URL: "",
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: "inherit",
  },
);

let stopping = false;

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    nextProcess.kill(signal);
  });
}

nextProcess.on("error", async (error) => {
  await removeSandbox();
  throw error;
});

nextProcess.on("exit", async (code, signal) => {
  await removeSandbox();
  process.exitCode = signal && stopping ? 0 : (code ?? 1);
});
