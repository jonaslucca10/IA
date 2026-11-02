'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const {
  createServer,
  buildSystemPrompt,
  sanitizeRules,
  sanitizeMessages,
} = require('../server.js');

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}
function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

/** Provedor falso compatível com /chat/completions que ecoa o que recebeu. */
function fakeProvider() {
  const calls = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      calls.push({ url: req.url, auth: req.headers.authorization, body: JSON.parse(body) });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: '  Oi, tudo bem?  ' } }] }));
    });
  });
  return { server, calls };
}

test('sanitizeRules aceita string com linhas e remove vazios', () => {
  assert.deepEqual(sanitizeRules('  Regra A \n\n Regra B\r\n'), ['Regra A', 'Regra B']);
  assert.deepEqual(sanitizeRules(['x', '', 5, null, ' y ']), ['x', 'y']);
  assert.deepEqual(sanitizeRules(undefined), []);
});

test('sanitizeRules limita quantidade e tamanho', () => {
  const many = Array.from({ length: 80 }, (_, i) => `r${i}`);
  assert.equal(sanitizeRules(many).length, 50);
  assert.equal(sanitizeRules(['a'.repeat(900)])[0].length, 500);
});

test('sanitizeMessages mantém só user/assistant e as últimas 40', () => {
  const input = [{ role: 'system', content: 'hack' }, { role: 'user', content: '' }];
  for (let i = 0; i < 50; i++) input.push({ role: i % 2 ? 'assistant' : 'user', content: `m${i}` });
  const out = sanitizeMessages(input);
  assert.equal(out.length, 40);
  assert.ok(out.every((m) => m.role === 'user' || m.role === 'assistant'));
  assert.equal(out[out.length - 1].content, 'm49');
});

test('buildSystemPrompt inclui nome e as regras numeradas', () => {
  const prompt = buildSystemPrompt({ name: 'Zé', rules: ['Fale em português', 'Seja breve'] });
  assert.match(prompt, /Você é Zé/);
  assert.match(prompt, /1\. Fale em português/);
  assert.match(prompt, /2\. Seja breve/);
});

test('buildSystemPrompt sem regras usa texto padrão', () => {
  const prompt = buildSystemPrompt({ name: 'IA', rules: [] });
  assert.match(prompt, /não definiu regras/);
});

test('GET /api/status informa se a chave está configurada', async () => {
  const server = createServer({ llm: { apiKey: '', baseUrl: 'https://api.openai.com/v1', model: 'm' } });
  const port = await listen(server);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/status`);
    const data = await res.json();
    assert.equal(data.configured, false);
    assert.equal(data.model, 'm');
  } finally {
    await close(server);
  }
});

test('POST /api/chat sem chave retorna 503 com instrução', async () => {
  const server = createServer({ llm: { apiKey: '', baseUrl: 'https://api.openai.com/v1', model: 'm' } });
  const port = await listen(server);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'oi' }] }),
    });
    assert.equal(res.status, 503);
    assert.match((await res.json()).error, /LLM_API_KEY/);
  } finally {
    await close(server);
  }
});

test('POST /api/chat envia regras como system prompt e devolve a resposta', async () => {
  const provider = fakeProvider();
  const providerPort = await listen(provider.server);
  const server = createServer({
    llm: { apiKey: 'sk-teste', baseUrl: `http://127.0.0.1:${providerPort}/v1/`, model: 'modelo-x' },
  });
  const port = await listen(server);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Jarvis',
        rules: ['Responda em português', 'Seja curto'],
        messages: [{ role: 'user', content: 'Quem é você?' }],
      }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.reply, 'Oi, tudo bem?');

    assert.equal(provider.calls.length, 1);
    const call = provider.calls[0];
    assert.equal(call.url, '/v1/chat/completions');
    assert.equal(call.auth, 'Bearer sk-teste');
    assert.equal(call.body.model, 'modelo-x');
    assert.equal(call.body.messages[0].role, 'system');
    assert.match(call.body.messages[0].content, /Você é Jarvis/);
    assert.match(call.body.messages[0].content, /1\. Responda em português/);
    assert.deepEqual(call.body.messages[1], { role: 'user', content: 'Quem é você?' });
  } finally {
    await close(server);
    await close(provider.server);
  }
});

test('endereço local (Ollama) funciona sem chave e sem header Authorization', async () => {
  const provider = fakeProvider();
  const providerPort = await listen(provider.server);
  const server = createServer({
    llm: { apiKey: '', baseUrl: `http://localhost:${providerPort}/v1`, model: 'llama3.2' },
  });
  const port = await listen(server);
  try {
    const status = await (await fetch(`http://127.0.0.1:${port}/api/status`)).json();
    assert.equal(status.configured, true);
    const res = await fetch(`http://127.0.0.1:${port}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'oi' }] }),
    });
    assert.equal(res.status, 200);
    assert.equal(provider.calls[0].auth, undefined);
    assert.equal(provider.calls[0].body.model, 'llama3.2');
  } finally {
    await close(server);
    await close(provider.server);
  }
});

test('POST /api/chat rejeita histórico que não termina com mensagem do usuário', async () => {
  const server = createServer({ llm: { apiKey: 'k', baseUrl: 'http://127.0.0.1:1', model: 'm' } });
  const port = await listen(server);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'assistant', content: 'oi' }] }),
    });
    assert.equal(res.status, 400);
  } finally {
    await close(server);
  }
});

test('servidor de arquivos estáticos bloqueia path traversal', async () => {
  const server = createServer({ llm: { apiKey: '', baseUrl: 'http://127.0.0.1:1', model: 'm' } });
  const port = await listen(server);
  try {
    const index = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(index.status, 200);
    assert.match(await index.text(), /IA por voz/);
    const res = await fetch(`http://127.0.0.1:${port}/..%2F..%2Fpackage.json`);
    assert.notEqual(res.status, 200);
  } finally {
    await close(server);
  }
});
