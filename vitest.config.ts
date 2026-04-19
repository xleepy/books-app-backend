import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["./tests/global-setup.ts"],
    fileParallelism: false,
    env: {
      DATABASE_URL: "postgresql://booksapp:booksapp@localhost:5432/booksapp_test",
    },
  },
});
