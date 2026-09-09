import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import handler from './api/index.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 8090);
const types = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'application/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.svg', 'image/svg+xml'],
  ['.woff2', 'font/woff2'],
  ['.ttf', 'font/ttf']
]);

function safePath(urlPath) {
  let decoded = decodeURIComponent(urlPath.split('?')[0]);
  const appRoutes = new Set(['/','/dashboard','/tasks','/projects','/schedule','/meetings','/clients','/finance','/invoices','/services','/support','/team','/timetracker','/goals','/settings','/reports','/vault']);
  if (appRoutes.has(decoded)) decoded = '/HTML/index.html';
  else if (decoded === '/admin' || decoded === '/admin/') decoded = '/HTML/admin.html';
  else if (decoded.startsWith('/store/')) decoded = '/HTML/store.html';
  else if (decoded.startsWith('/portal/')) decoded = '/HTML/client-portal.html';
  else if (decoded.startsWith('/proposal/')) decoded = '/HTML/proposal.html';
  else if (decoded.startsWith('/review/')) decoded = '/HTML/review.html';
  else if (decoded.startsWith('/reviews/')) decoded = '/HTML/reviews-public.html';
  const full = path.normalize(path.join(root, decoded));
  return full.startsWith(root) ? full : path.join(root, 'index.html');
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith('/api/')) {
      return handler(req, res);
    }
    const filePath = safePath(req.url);
    const data = await fs.readFile(filePath);
    res.writeHead(200, { 'Content-Type': types.get(path.extname(filePath)) || 'application/octet-stream' });
    res.end(data);
  } catch (error) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Ordo final is running at http://127.0.0.1:${port}/HTML/index.html`);
});
