import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "core",
          root: "packages/core",
          include: ["tests/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        test: {
          name: "api",
          root: "apps/api",
          include: ["tests/**/*.test.ts"],
          environment: "node",
          fileParallelism: false,
          testTimeout: 30_000,
          env: {
            DATABASE_URL:
              process.env.SELO_TEST_DATABASE_URL ?? "postgres://selo@localhost:54330/selo_test",
          },
        },
      },
    ],
  },
});
