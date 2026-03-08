const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number.parseInt(process.env.PORT || "5173", 10);
const ROOT = __dirname;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".webm": "audio/webm",
  ".mp4": "video/mp4"
};

function send(res, statusCode, body, contentType) {
  const payload = Buffer.from(body, "utf8");
  res.writeHead(statusCode, {
    "Content-Type": contentType,
    "Content-Length": payload.length,
    "Cache-Control": "no-store",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "require-corp",
    "Cross-Origin-Resource-Policy": "same-origin"
  });
  res.end(payload);
}

function resolvePath(urlPathname) {
  const decodedPath = decodeURIComponent(urlPathname);
  const safePath = decodedPath.replace(/\\/g, "/");
  const normalized = path.normalize(safePath).replace(/^([.][.][/\\])+/, "");
  const relativePath = normalized.replace(/^[/\\]+/, "");
  const rawFilePath = relativePath || "index.html";
  const absolutePath = path.resolve(ROOT, rawFilePath);

  if (absolutePath !== ROOT && !absolutePath.startsWith(`${ROOT}${path.sep}`)) {
    return "";
  }

  return absolutePath;
}

const server = http.createServer((req, res) => {
  try {
    const requestUrl = new URL(req.url || "/", `http://${req.headers.host || `${HOST}:${PORT}`}`);
    const absolutePath = resolvePath(requestUrl.pathname);

    if (!absolutePath) {
      send(res, 403, "Forbidden", "text/plain; charset=utf-8");
      return;
    }

    let filePath = absolutePath;
    const stats = fs.existsSync(filePath) ? fs.statSync(filePath) : null;

    if (stats && stats.isDirectory()) {
      filePath = path.join(filePath, "index.html");
    }

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      send(res, 404, "Not Found", "text/plain; charset=utf-8");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Resource-Policy": "same-origin"
    });

    const stream = fs.createReadStream(filePath);
    stream.on("error", () => {
      if (!res.headersSent) {
        send(res, 500, "Internal Server Error", "text/plain; charset=utf-8");
      } else {
        res.destroy();
      }
    });
    stream.pipe(res);
  } catch (_err) {
    send(res, 500, "Internal Server Error", "text/plain; charset=utf-8");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Dev server running at http://${HOST}:${PORT}`);
  console.log("COOP/COEP headers are enabled for ffmpeg.wasm.");
});
