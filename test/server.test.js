'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('../server.js');
const { runChat, sanitizeMessages, sanitizeName } = require('../lib/core.js');
const { train } = require('../lib/ngram.js');

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}
function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

const RULES = [
  'oi, olá => Olá, eu sou o {nome}!',
  'quem é você => Sou um assistente de voz.',
].join('\n');

test('sanitizeMessages mantém só user/assistant e as últimas 40', () => {
  const input = [{ role: 'system', content: 'hack' }, { role: 'user', content: '' }];
  for (let i = 0; i < 50; i++) input.push({ role: i % 2 ? 'assistant' : 'user', content: `m${i}` });
  const out = sanitizeMessages(input);
  assert.equal(out.length, 40);
  assert.equal(out[out.length - 1].content, 'm49');
});

test('sanitizeName usa padrão quando vazio', () => {
  assert.equal(sanitizeName('  '), 'Assistente');
  assert.equal(sanitizeName('Zé'), 'Zé');
});

test('runChat responde com a regra cadastrada e troca {nome}', () => {
  const out = runChat(
    { name: 'Jarvis', rules: RULES, messages: [{ role: 'user', content: 'Oi, tudo bem?' }] },
    { rng: () => 0 }
  );
  assert.deepEqual(out, { reply: 'Olá, eu sou o Jarvis!', source: 'rule', name: 'Jarvis' });
});

test('runChat usa o modelo próprio quando nenhuma regra casa', () => {
  const model = train('a praia é bonita no verão.');
  const out = runChat(
    { name: 'IA', rules: RULES, messages: [{ role: 'user', content: 'me fale de astronomia' }] },
    { rng: () => 0, model }
  );
  assert.equal(out.source, 'model');
  assert.equal(out.reply, 'A praia é bonita no verão.');
});

test('runChat sem modelo treinado devolve a mensagem de reserva', () => {
  const out = runChat(
    { rules: '', messages: [{ role: 'user', content: 'qualquer coisa' }] },
    { model: train('') }
  );
  assert.equal(out.source, 'model');
  assert.match(out.reply, /Não entendi/);
});

test('runChat exige que a última mensagem seja do usuário', () => {
  assert.throws(
    () => runChat({ messages: [{ role: 'assistant', content: 'oi' }] }),
    (err) => err.status === 400
  );
});

test('POST /api/chat responde via HTTP', async () => {
  const server = createServer();
  const port = await listen(server);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Ana', rules: RULES, messages: [{ role: 'user', content: 'quem é você?' }] }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.reply, 'Sou um assistente de voz.');
    assert.equal(data.source, 'rule');
  } finally {
    await close(server);
  }
});

test('POST /api/chat com JSON inválido retorna 400', async () => {
  const server = createServer();
  const port = await listen(server);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ruim',
    });
    assert.equal(res.status, 400);
  } finally {
    await close(server);
  }
});

test('servidor serve a página e bloqueia path traversal', async () => {
  const server = createServer();
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
