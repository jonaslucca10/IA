'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseTeachCommand, applyLearn, applyForget, removeTrigger } = require('../lib/teach');
const { runChat } = require('../lib/core');
const { train } = require('../lib/ngram');

const EMPTY_MODEL = train('');

test('reconhece "aprenda: quando eu disser X, responda Y"', () => {
  assert.deepEqual(parseTeachCommand('aprenda: quando eu disser oi, responda Olá, tudo bem!'), {
    type: 'learn',
    trigger: 'oi',
    response: 'Olá, tudo bem!',
  });
});

test('reconhece a forma curta sem "aprenda"', () => {
  assert.deepEqual(parseTeachCommand('quando eu disser tchau responda até logo'), {
    type: 'learn',
    trigger: 'tchau',
    response: 'até logo',
  });
});

test('reconhece "esqueça X"', () => {
  assert.deepEqual(parseTeachCommand('esqueça oi'), { type: 'forget', trigger: 'oi' });
  assert.deepEqual(parseTeachCommand('Esqueça quando eu disser bom dia.'), { type: 'forget', trigger: 'bom dia' });
});

test('aceita variações naturais de fala', () => {
  assert.deepEqual(parseTeachCommand('aprenda que quando eu falar oi você responde olá'), {
    type: 'learn',
    trigger: 'oi',
    response: 'olá',
  });
  assert.deepEqual(parseTeachCommand('aprenda isso: quando eu disser oi responda olá'), {
    type: 'learn',
    trigger: 'oi',
    response: 'olá',
  });
  assert.deepEqual(parseTeachCommand('se eu disser tudo bem você responde tudo joia'), {
    type: 'learn',
    trigger: 'tudo bem',
    response: 'tudo joia',
  });
});

test('reconhece variações de esquecer sem pegar o "que" como gatilho', () => {
  assert.deepEqual(parseTeachCommand('esquece oi'), { type: 'forget', trigger: 'oi' });
  assert.deepEqual(parseTeachCommand('esqueça que quando eu disser oi'), { type: 'forget', trigger: 'oi' });
});

test('frases comuns não são tratadas como comando', () => {
  assert.equal(parseTeachCommand('se eu falar sobre futebol gosto muito'), null);
  assert.equal(parseTeachCommand('qual é a capital da França?'), null);
});

test('tentativa de ensinar incompleta é sinalizada como inválida', () => {
  assert.deepEqual(parseTeachCommand('aprenda: quando eu disser oi'), { type: 'invalid' });
});

test('applyLearn adiciona a regra e substitui a antiga com o mesmo gatilho', () => {
  const text = applyLearn('# comentário\noi => Oi antigo\ntchau => Tchau', 'oi', 'Olá!');
  assert.equal(text, '# comentário\ntchau => Tchau\noi => Olá!');
});

test('removeTrigger mantém os outros gatilhos da mesma linha', () => {
  assert.equal(removeTrigger('oi, olá => Oi', 'oi'), 'olá => Oi');
});

test('applyForget informa se algo foi removido', () => {
  assert.deepEqual(applyForget('oi => Olá', 'oi'), { text: '', removed: true });
  assert.deepEqual(applyForget('oi => Olá', 'xyz'), { text: 'oi => Olá', removed: false });
});

test('ciclo completo: ensina, usa a regra nova e esquece', () => {
  let rules = 'oi => Olá antigo';
  const teach = runChat(
    { name: 'Lu', rules, messages: [{ role: 'user', content: 'aprenda: quando eu disser abacaxi, responda Que fruta gostosa!' }] },
    { model: EMPTY_MODEL }
  );
  assert.equal(teach.source, 'teach');
  assert.match(teach.reply, /Aprendi!/);
  rules = teach.rules;
  assert.match(rules, /abacaxi => Que fruta gostosa!/);

  const used = runChat(
    { name: 'Lu', rules, messages: [{ role: 'user', content: 'eu comi um abacaxi hoje' }] },
    { model: EMPTY_MODEL, rng: () => 0 }
  );
  assert.equal(used.source, 'rule');
  assert.equal(used.reply, 'Que fruta gostosa!');

  const forgot = runChat(
    { name: 'Lu', rules, messages: [{ role: 'user', content: 'esqueça abacaxi' }] },
    { model: EMPTY_MODEL }
  );
  assert.equal(forgot.reply, 'Pronto, esqueci "abacaxi".');
  assert.doesNotMatch(forgot.rules, /abacaxi/);
});

test('tentativa de ensinar mal formada responde com ajuda e não muda as regras', () => {
  const out = runChat(
    { rules: 'oi => Olá', messages: [{ role: 'user', content: 'aprenda: quando eu disser oi' }] },
    { model: EMPTY_MODEL }
  );
  assert.equal(out.source, 'teach');
  assert.equal(out.rules, undefined);
  assert.match(out.reply, /Não entendi/);
});

test('esquecer algo que não existe avisa', () => {
  const out = runChat(
    { rules: 'oi => Olá', messages: [{ role: 'user', content: 'esqueça banana' }] },
    { model: EMPTY_MODEL }
  );
  assert.equal(out.reply, 'Eu não tinha aprendido "banana".');
});
