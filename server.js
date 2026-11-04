'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const ROOT = __dirname;
const PORT = Number.parseInt(process.env.PORT || '4173', 10);
const PUBLIC_FILES = new Set([
  'index.html',
  'styles.css',
  'local-engine.js',
  'app.js',
  'manifest.webmanifest',
  'service-worker.js',
  'icon.svg',
]);
const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
};

function sendError(response, statusCode, message) {
  response.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  });
  response.end(message);
}

async function serveStatic(request, response) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    sendError(response, 405, 'Method not allowed');
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  } catch {
    sendError(response, 400, 'Invalid URL');
    return;
  }

  const fileName = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  if (!PUBLIC_FILES.has(fileName)) {
    sendError(response, 404, 'Not found');
    return;
  }

  const filePath = path.resolve(ROOT, fileName);
  if (!filePath.startsWith(`${ROOT}${path.sep}`)) {
    sendError(response, 404, 'Not found');
    return;
  }

  try {
    const stats = await fs.promises.stat(filePath);
    response.writeHead(200, {
      'Content-Type': CONTENT_TYPES[path.extname(filePath)] || 'application/octet-stream',
      'Content-Length': stats.size,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'same-origin',
      'Permissions-Policy': 'microphone=(self), camera=(), geolocation=()',
      ...(fileName === 'service-worker.js' ? { 'Service-Worker-Allowed': '/' } : {}),
    });
    if (request.method === 'HEAD') response.end();
    else fs.createReadStream(filePath).pipe(response);
  } catch {
    sendError(response, 404, 'Not found');
  }
}

const server = http.createServer((request, response) => {
  void serveStatic(request, response);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Jonis.IA local disponível em http://0.0.0.0:${PORT}`);
  console.log('Motor local ativo: nenhuma API externa é chamada.');
});
