// 零依赖静态服务器：node server.mjs [端口]
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.argv[2]) || 5173;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.otf': 'font/otf',
  '.ttf': 'font/ttf',
};

const server = http.createServer(async (req, res) => {
  try {
    let pathname = decodeURIComponent((req.url || '/').split('?')[0]);
    if (pathname.endsWith('/')) pathname += 'index.html';
    const file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(root)) {
      res.writeHead(403).end('forbidden');
      return;
    }
    const info = await stat(file);
    if (info.isDirectory()) {
      res.writeHead(302, { Location: pathname + '/' }).end();
      return;
    }
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`循环勇者已启动： http://127.0.0.1:${port}`);
  console.log('按 Ctrl+C 停止。');
});
