'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, 'public');

const MAX_BODY_BYTES = 200 * 1024;
const MAX_HISTORY = 40;
const MAX_RULES = 50;
const MAX_RULE_LENGTH = 500;
const MAX_NAME_LENGTH = 40;
const MAX_MESSAGE_LENGTH = 4000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/**
 * Normaliza a lista de regras vinda do cliente.
 * Aceita string (uma regra por linha) ou array de strings.
 */
function sanitizeRules(input) {
  let list = [];
  if (typeof input === 'string') list = input.split(/\r?\n/);
  else if (Array.isArray(input)) list = input;

  return list
    .filter((r) => typeof r === 'string')
    .map((r) => r.trim())
    .filter(Boolean)
    .slice(0, MAX_RULES)
    .map((r) => r.slice(0, MAX_RULE_LENGTH));
}

function sanitizeName(input) {
  const name = typeof input === 'string' ? input.trim() : '';
  return (name || 'Assistente').slice(0, MAX_NAME_LENGTH);
}

/** Endereços locais (ex.: Ollama) não precisam de chave de API. */
function requiresApiKey(baseUrl) {
  try {
    const host = new URL(baseUrl).hostname;
    return !['localhost', '127.0.0.1', '::1', '[::1]'].includes(host);
  } catch {
    return true;
  }
}

/** Mantém só mensagens user/assistant válidas e as últimas MAX_HISTORY. */
function sanitizeMessages(input) {
  if (!Array.isArray(input)) return [];
  return input
    .filter(
      (m) =>
        m &&
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string' &&
        m.content.trim()
    )
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_LENGTH) }))
    .slice(-MAX_HISTORY);
}

/** Monta o system prompt a partir das regras definidas pelo usuário. */
function buildSystemPrompt({ name, rules }) {
  const lines = [
    `Você é ${name}, um assistente de conversa por voz.`,
    'Siga as regras abaixo, definidas pelo usuário, com prioridade sobre o estilo padrão.',
  ];
  if (rules.length) {
    lines.push('', 'REGRAS DO USUÁRIO:');
    rules.forEach((rule, i) => lines.push(`${i + 1}. ${rule}`));
  } else {
    lines.push('', 'O usuário não definiu regras específicas; seja útil e natural.');
  }
  lines.push(
    '',
    'Como sua resposta será falada em voz alta, escreva frases naturais,',
    'sem markdown, listas com símbolos, emojis ou blocos de código, a menos que o usuário peça.'
  );
  return lines.join('\n');
}

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
 * Cria o servidor HTTP.
 * options.llm = { baseUrl, apiKey, model } — por padrão lê das variáveis de ambiente.
 */
function createServer(options = {}) {
  const llm = {
    baseUrl: (options.llm?.baseUrl ?? process.env.LLM_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/+$/, ''),
    apiKey: options.llm?.apiKey ?? process.env.LLM_API_KEY ?? '',
    model: options.llm?.model ?? process.env.LLM_MODEL ?? 'gpt-4o-mini',
  };

  const keyRequired = requiresApiKey(llm.baseUrl);
  const isConfigured = () => !keyRequired || Boolean(llm.apiKey);

  async function callLLM(messages) {
    if (!isConfigured()) {
      throw new HttpError(
        503,
        'Nenhuma chave de IA configurada. Defina LLM_API_KEY (e, se quiser, LLM_BASE_URL e LLM_MODEL) e reinicie o servidor.'
      );
    }
    const headers = { 'Content-Type': 'application/json' };
    if (llm.apiKey) headers.Authorization = `Bearer ${llm.apiKey}`;
    let response;
    try {
      response = await fetch(`${llm.baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ model: llm.model, messages, temperature: 0.7 }),
      });
    } catch (err) {
      throw new HttpError(502, `Não foi possível contatar o provedor de IA: ${err.message}`);
    }
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = data?.error?.message || response.statusText;
      throw new HttpError(502, `Erro do provedor de IA (${response.status}): ${detail}`);
    }
    const reply = data?.choices?.[0]?.message?.content;
    if (typeof reply !== 'string' || !reply.trim()) {
      throw new HttpError(502, 'Resposta vazia ou inesperada do provedor de IA.');
    }
    return reply.trim();
  }

  async function handleChat(req, res) {
    const body = await readJson(req);
    const name = sanitizeName(body.name);
    const rules = sanitizeRules(body.rules);
    const history = sanitizeMessages(body.messages);
    if (!history.length || history[history.length - 1].role !== 'user') {
      throw new HttpError(400, 'Envie ao menos uma mensagem do usuário.');
    }
    const messages = [{ role: 'system', content: buildSystemPrompt({ name, rules }) }, ...history];
    const reply = await callLLM(messages);
    sendJson(res, 200, { reply, name });
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (req.method === 'GET' && url.pathname === '/api/status') {
        return sendJson(res, 200, { configured: isConfigured(), model: llm.model, baseUrl: llm.baseUrl });
      }
      if (req.method === 'POST' && url.pathname === '/api/chat') {
        return await handleChat(req, res);
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

module.exports = { createServer, buildSystemPrompt, sanitizeRules, sanitizeMessages, sanitizeName };

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST || '0.0.0.0';
  createServer().listen(port, host, () => {
    console.log(`IA por voz rodando em http://localhost:${port}`);
    if (!process.env.LLM_API_KEY && requiresApiKey(process.env.LLM_BASE_URL || 'https://api.openai.com/v1')) {
      console.log('Aviso: LLM_API_KEY não definida. Se o provedor for remoto, o chat responderá com erro.');
    }
  });
}
