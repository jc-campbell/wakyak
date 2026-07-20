import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: { WAKYAK_INTEGRATION: "true" },
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.integration.test.ts"],
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
