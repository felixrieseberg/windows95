import { protocol } from "electron";
import * as fs from "fs";
import * as path from "path";
import { log } from "../logging";

// Serves the bundled static/www site to the guest at http://windows95/.
// Host-filesystem browsing was removed in favour of the SMB share.
const APP_INTERCEPT = "http://windows95/";
const WWW_ROOT = path.resolve(__dirname, "../../../static/www");

export function setupFileServer() {
  protocol.handle("http", async (request) => {
    if (!request.url.startsWith(APP_INTERCEPT)) {
      return fetch(request.url, {
        headers: request.headers,
        method: request.method,
        body: request.body,
      });
    }

    try {
      const rel = decodeURIComponent(request.url.slice(APP_INTERCEPT.length));
      let fullPath = path.join(WWW_ROOT, rel);
      if (fullPath !== WWW_ROOT && !fullPath.startsWith(WWW_ROOT + path.sep)) {
        fullPath = WWW_ROOT;
      }
      log(`FileServer: ${request.url} → ${fullPath}`);

      const stats = await fs.promises.stat(fullPath);
      if (stats.isDirectory()) fullPath = path.join(fullPath, "index.htm");
      return await serveFile(fullPath);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      const status = code === "ENOENT" ? 404 : code === "EACCES" ? 403 : 500;
      return new Response(`${status} ${code ?? "Error"}: ${request.url}`, {
        status,
        headers: { "Content-Type": "text/plain" },
      });
    }
  });
}

const CONTENT_TYPES: Record<string, string> = {
  ".htm": "text/html",
  ".html": "text/html",
  ".txt": "text/plain",
  ".css": "text/css",
  ".js": "text/javascript",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
};

async function serveFile(fullPath: string): Promise<Response> {
  const fileData = await fs.promises.readFile(fullPath);
  const ext = path.extname(fullPath).toLowerCase();
  return new Response(fileData, {
    status: 200,
    headers: {
      "Content-Type": CONTENT_TYPES[ext] ?? "application/octet-stream",
    },
  });
}
