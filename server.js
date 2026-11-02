'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const core = require('./lib/core');

const { HttpError, llmConfig, isConfigured, runChat } = core;

const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_BODY_BYTES = 200 * 1024;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'Requisição muito grande.');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw new HttpError(400, 'JSON inválido.');
  }
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

function serveStatic(req, res, pathname) {
  const requested = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, requested));
  if (!filePath.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Não encontrado');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[path.extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
}

/**
 * Cria o servidor HTTP local.
 * options.llm = { baseUrl, apiKey, model } — por padrão lê das variáveis de ambiente.
 */
function createServer(options = {}) {
  const config = llmConfig(options.llm);

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (req.method === 'GET' && url.pathname === '/api/status') {
        return sendJson(res, 200, { configured: isConfigured(config), model: config.model, baseUrl: config.baseUrl });
      }
      if (req.method === 'POST' && url.pathname === '/api/chat') {
        const body = await readJson(req);
        return sendJson(res, 200, await runChat(config, body));
      }
      if (req.method === 'GET' || req.method === 'HEAD') {
        return serveStatic(req, res, url.pathname);
      }
      throw new HttpError(405, 'Método não permitido.');
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) console.error(err);
      if (!res.headersSent) {
        sendJson(res, status, { error: err instanceof HttpError ? err.message : 'Erro interno do servidor.' });
      }
    }
  });

  return server;
}

module.exports = {
  createServer,
  buildSystemPrompt: core.buildSystemPrompt,
  sanitizeRules: core.sanitizeRules,
  sanitizeMessages: core.sanitizeMessages,
  sanitizeName: core.sanitizeName,
};

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST || '0.0.0.0';
  createServer().listen(port, host, () => {
    console.log(`IA por voz rodando em http://localhost:${port}`);
    if (!isConfigured(llmConfig())) {
      console.log('Aviso: LLM_API_KEY não definida. Se o provedor for remoto, o chat responderá com erro.');
    }
  });
}
