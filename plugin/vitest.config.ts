import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "host",
          include: ["tests/unit/**/*.spec.ts"],
          environment: "node",
        },
      },
      {
        extends: true,
        test: {
          name: "client",
          include: ["tests/client/**/*.spec.ts", "tests/client/**/*.spec.tsx"],
          environment: "jsdom",
        },
      },
      {
        extends: true,
        test: {
          name: "contract",
          include: ["tests/contract/**/*.spec.ts"],
          environment: "node",
        },
      },
    ],
  },
});
