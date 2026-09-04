// Minimal static server for local development: node scripts/serve.mjs [port]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.argv[2] || process.env.PORT || 4173);
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
};

http.createServer((req, res) => {
  let urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (urlPath.endsWith('/')) urlPath += 'index.html';
  const file = path.join(root, urlPath);
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      // A directory URL resolves to its index.html, the way Vercel's cleanUrls
      // serves the prerendered pages: /academic is academic/index.html.
      const dirIndex = path.join(file, 'index.html');
      if (!path.extname(urlPath) && fs.existsSync(dirIndex)) {
        res.writeHead(200, { 'content-type': types['.html'], 'cache-control': 'no-store' });
        return fs.createReadStream(dirIndex).pipe(res);
      }
      // SPA fallback
      const index = path.join(root, 'index.html');
      if (fs.existsSync(index) && !path.extname(urlPath)) {
        res.writeHead(200, { 'content-type': types['.html'] });
        return fs.createReadStream(index).pipe(res);
      }
      res.writeHead(404); return res.end('not found');
    }
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
}).listen(port, () => console.log(`serving ${root} at http://localhost:${port}`));
