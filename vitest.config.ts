import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  // Automatic JSX runtime so component tests can render .tsx with react-dom/server (tsconfig keeps
  // jsx: "preserve" for Next; this only affects Vitest's transform).
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: { "@": resolve(__dirname, "./src") },
  },
  test: {
    environment: "node",
    include: ["src/tests/**/*.test.ts"],
  },
});
