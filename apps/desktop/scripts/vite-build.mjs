import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { build } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

await build({
  configFile: false,
  root,
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(root, "src/renderer")
    }
  },
  build: {
    outDir: "dist/renderer",
    emptyOutDir: true
  }
});
