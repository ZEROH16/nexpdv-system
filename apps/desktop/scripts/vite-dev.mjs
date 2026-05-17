import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const server = await createServer({
  configFile: false,
  root,
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(root, "src/renderer")
    }
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true
  }
});

await server.listen();
server.printUrls();
