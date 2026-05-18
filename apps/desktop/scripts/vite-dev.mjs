import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = path.resolve(root, "../..");
const require = createRequire(import.meta.url);

const resolveWithExtensions = (basePath) => {
  const candidates = [
    basePath,
    `${basePath}.js`,
    `${basePath}.mjs`,
    `${basePath}.cjs`,
    `${basePath}.jsx`,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    path.join(basePath, "index.js"),
    path.join(basePath, "index.mjs"),
    path.join(basePath, "index.cjs")
  ];
  return candidates.find((candidate) => fs.existsSync(candidate));
};

const workspaceDependencyResolver = () => ({
  name: "nexpdv-workspace-dependency-resolver",
  setup(build) {
    build.onResolve({ filter: /^[^./]|^@/ }, (args) => {
      try {
        return { path: require.resolve(args.path, { paths: [root, workspaceRoot] }) };
      } catch {
        return undefined;
      }
    });

    build.onResolve({ filter: /^\.+\// }, (args) => {
      const resolved = resolveWithExtensions(path.resolve(args.resolveDir, args.path));
      return resolved ? { path: resolved } : undefined;
    });
  }
});

const server = await createServer({
  configFile: false,
  root,
  cacheDir: path.join(workspaceRoot, "node_modules", ".vite", "desktop"),
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(root, "src/renderer")
    }
  },
  optimizeDeps: {
    include: ["@nexpdv/shared", "react", "react-dom", "react-dom/client", "react/jsx-runtime", "react/jsx-dev-runtime", "zustand", "lucide-react", "recharts"],
    esbuildOptions: {
      plugins: [workspaceDependencyResolver()]
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
