import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": projectRoot,
      "server-only": path.join(projectRoot, "tests", "stubs", "server-only.ts"),
    },
  },
  test: {
    environment: "node",
    fileParallelism: false,
    include: [
      "tests/unit/**/*.test.ts",
      "tests/api/**/*.test.ts",
    ],
  },
});
