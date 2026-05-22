import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, "dist");
const indexPath = path.join(distDir, "index.html");
const port = Number(process.env.PORT || 4174);
const host = process.env.HOST || "0.0.0.0";

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp"
};

const sendJson = (response, statusCode, body) => {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(body));
};

const sendFile = (response, filePath) => {
  const type = contentTypes[path.extname(filePath)] || "application/octet-stream";
  response.writeHead(200, { "Content-Type": type });
  createReadStream(filePath).pipe(response);
};

const resolveStaticPath = (requestUrl) => {
  let url;
  try {
    url = new URL(requestUrl || "/", "http://localhost");
  } catch {
    return undefined;
  }
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(url.pathname);
  } catch {
    return undefined;
  }
  const candidate = path.normalize(path.join(distDir, decodedPath));
  const relative = path.relative(distDir, candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return undefined;
  if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  return indexPath;
};

const server = createServer((request, response) => {
  if (request.url?.startsWith("/health")) {
    sendJson(response, 200, { status: "ok", product: "NexPDV Admin" });
    return;
  }

  if (!existsSync(indexPath)) {
    sendJson(response, 500, { status: "error", message: "Admin build nao encontrado. Execute npm run build -w @nexpdv/admin." });
    return;
  }

  const filePath = resolveStaticPath(request.url);
  if (!filePath) {
    sendJson(response, 400, { status: "error", message: "Caminho invalido." });
    return;
  }

  sendFile(response, filePath);
});

server.listen(port, host, () => {
  console.log(`NexPDV Admin serving ${distDir} on http://${host}:${port}`);
});
