'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { train, generate, tokenizeSentences } = require('../lib/ngram');
const { CORPUS } = require('../lib/corpus');

test('tokenizeSentences separa frases e palavras', () => {
  assert.deepEqual(tokenizeSentences('Oi, tudo bem? Sim!'), [['oi', 'tudo', 'bem'], ['sim']]);
});

test('generate reproduz apenas sequências vistas no treino', () => {
  const model = train('eu gosto de café. eu gosto de chá.');
  for (let i = 0; i < 30; i++) {
    const out = generate(model, Math.random);
    assert.match(out, /^Eu gosto de (café|chá)\.$/);
  }
});

test('generate retorna string vazia sem treino', () => {
  assert.equal(generate(train(''), () => 0.5), '');
});

test('o corpo padrão gera frases em maiúscula terminadas em ponto', () => {
  const model = train(CORPUS);
  const out = generate(model, () => 0.37);
  assert.ok(out.length > 0);
  assert.equal(out[0], out[0].toUpperCase());
  assert.ok(out.endsWith('.'));
});
