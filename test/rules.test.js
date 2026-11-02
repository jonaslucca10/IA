'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalize, parseRules, findRule, pickResponse } = require('../lib/rules');

test('normalize remove acentos, caixa e pontuação', () => {
  assert.equal(normalize('Olá, VOCÊ! está?'), 'ola voce esta');
});

test('parseRules lê gatilhos, respostas e ignora comentários e linhas inválidas', () => {
  const rules = parseRules(
    ['# comentário', 'oi, olá => Olá!|Oi!', 'linha sem separador', ' => sem gatilho', 'tchau =>'].join('\n')
  );
  assert.equal(rules.length, 1);
  assert.deepEqual(rules[0].triggers, ['oi', 'ola']);
  assert.deepEqual(rules[0].responses, ['Olá!', 'Oi!']);
});

test('findRule casa palavra inteira, não pedaço de palavra', () => {
  const rules = parseRules('oi => Olá!');
  assert.ok(findRule(rules, 'oi, tudo bem?'));
  assert.equal(findRule(rules, 'oink'), null);
});

test('findRule prefere o gatilho mais longo', () => {
  const rules = parseRules(['bom dia => Dia!', 'bom => Bom.'].join('\n'));
  assert.equal(findRule(rules, 'bom dia pessoal').responses[0], 'Dia!');
});

test('findRule ignora acentos e caixa', () => {
  const rules = parseRules('quem é você => Sou eu.');
  assert.ok(findRule(rules, 'QUEM E VOCE?'));
});

test('pickResponse escolhe entre as respostas com o rng informado', () => {
  const rule = { triggers: ['x'], responses: ['a', 'b', 'c'] };
  assert.equal(pickResponse(rule, () => 0), 'a');
  assert.equal(pickResponse(rule, () => 0.99), 'c');
});
