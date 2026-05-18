import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, "../..");
const require = createRequire(import.meta.url);

interface ResolveArgs {
  path: string;
  resolveDir: string;
}

interface ResolveBuild {
  onResolve(options: { filter: RegExp }, callback: (args: ResolveArgs) => { path: string } | undefined): void;
}

interface ResolverPlugin {
  name: string;
  setup(build: ResolveBuild): void;
}

const resolveWithExtensions = (basePath: string): string | undefined => {
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

const workspaceDependencyResolver = (): ResolverPlugin => ({
  name: "nexpdv-workspace-dependency-resolver",
  setup(build) {
    build.onResolve({ filter: /^[^./]|^@/ }, (args) => {
      try {
        return { path: require.resolve(args.path, { paths: [__dirname, workspaceRoot] }) };
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

export default defineConfig({
  plugins: [react()],
  root: ".",
  cacheDir: path.join(workspaceRoot, "node_modules", ".vite", "desktop"),
  base: "./",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src/renderer")
    }
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true
  },
  optimizeDeps: {
    include: ["@nexpdv/shared", "react", "react-dom", "react-dom/client", "react/jsx-runtime", "react/jsx-dev-runtime", "zustand", "lucide-react", "recharts"],
    esbuildOptions: {
      plugins: [workspaceDependencyResolver() as never]
    }
  },
  build: {
    outDir: "dist/renderer",
    emptyOutDir: true
  }
});
