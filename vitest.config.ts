import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      { test: { name: "unit", include: ["tests/unit/**/*.test.ts"] } },
      { test: { name: "engine", include: ["tests/engine/**/*.test.ts"] } },
      {
        test: {
          name: "browser",
          include: ["tests/browser/**/*.test.ts"],
          // Firefox reads enterprise policies from one shared file, so legs run one at a time.
          fileParallelism: false,
          testTimeout: 60_000,
          hookTimeout: 120_000,
        },
      },
      {
        test: {
          name: "live",
          include: ["tests/live/**/*.test.ts"],
          fileParallelism: false,
          testTimeout: 90_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
