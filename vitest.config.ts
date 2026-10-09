import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { spendpreflight: fileURLToPath(new URL("./src/index.ts", import.meta.url)) },
  },
});
