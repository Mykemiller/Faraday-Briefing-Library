import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": resolve(__dirname, "./src") },
  },
  // Components are rendered in tests (BL3-11); tsconfig keeps "jsx": "preserve" for Next.
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: ["src/tests/**/*.test.ts"],
  },
});
