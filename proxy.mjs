#!/usr/bin/env node
/**
 * MinhaIA — proxy local (opcional)
 * ------------------------------------------------------------
 * Alguns provedores bloqueiam chamadas feitas direto do navegador
 * (CORS). Este proxy roda só na sua máquina e repassa as chamadas
 * do app para o provedor, mantendo o streaming.
 *
 * Uso:
 *   node proxy.mjs
 *   (porta padrão 8787, só em 127.0.0.1)
 *
 * No app, troque o endpoint por:
 *   http://127.0.0.1:8787/https://api.openai.com/v1
 *
 * O proxy NÃO guarda nada: ele apenas encaminha a requisição.
 * Ele não é feito para ficar exposto na internet.
 */

import http from 'node:http';

const PORT = Number(process.env.PORT || 8787);
const HOST = '127.0.0.1';

// cabeçalhos repassados ao provedor
const FORWARD_HEADERS = ['authorization', 'content-type', 'accept', 'http-referer', 'x-title', 'x-api-key'];

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, HTTP-Referer, X-Title, X-Api-Key',
  'Access-Control-Max-Age': '86400'
};

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors);
    return res.end();
  }

  const target = (req.url || '').replace(/^\/+/, '');
  if (!/^https?:\/\//i.test(target)) {
    res.writeHead(400, { ...cors, 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end(
      'MinhaIA proxy\n\nUse assim: http://127.0.0.1:' + PORT + '/https://api.openai.com/v1\n' +
      'O caminho depois da barra é a URL completa do provedor.\n'
    );
  }

  let body = '';
  try {
    for await (const chunk of req) body += chunk;
  } catch {
    res.writeHead(400, cors);
    return res.end('Falha ao ler o corpo da requisição');
  }

  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (FORWARD_HEADERS.includes(k.toLowerCase()) && typeof v === 'string') headers[k] = v;
  }

  console.log(`→ ${req.method} ${target}`);

  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body
    });

    const out = { ...cors, 'Content-Type': upstream.headers.get('content-type') || 'application/json' };
    res.writeHead(upstream.status, out);

    if (!upstream.body) { res.end(); return; }

    // repassa em tempo real (streaming SSE)
    const reader = upstream.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  } catch (err) {
    console.error('✕ erro:', err.message);
    if (!res.headersSent) {
      res.writeHead(502, { ...cors, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'Proxy não conseguiu falar com o provedor: ' + err.message } }));
    } else {
      res.end();
    }
  }
});

server.listen(PORT, HOST, () => {
  console.log(`\n  MinhaIA proxy rodando em http://${HOST}:${PORT}`);
  console.log(`  Exemplo de endpoint: http://${HOST}:${PORT}/https://api.openai.com/v1\n`);
  console.log('  Uso local apenas. Ctrl+C para parar.\n');
});
