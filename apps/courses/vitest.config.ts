import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "apps/courses/src/**/*.test.ts",
      "tools/courses/**/*.test.mjs",
    ],
  },
});
