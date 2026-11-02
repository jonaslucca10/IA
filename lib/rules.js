'use strict';

/**
 * Motor de regras: cada linha do texto de regras tem o formato
 *   gatilho1, gatilho2 => resposta A | resposta B
 * Se a mensagem contém um gatilho, uma das respostas é escolhida ao acaso.
 */

const MAX_RULES = 200;
const MAX_TRIGGERS = 20;
const MAX_RESPONSES = 10;
const MAX_RESPONSE_LENGTH = 300;

/** Minúsculas, sem acentos e sem pontuação; mantém letras e números de qualquer idioma. */
function normalize(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Converte o texto de regras em uma lista de { triggers, responses }. */
function parseRules(input) {
  const text = Array.isArray(input) ? input.join('\n') : typeof input === 'string' ? input : '';
  const rules = [];
  for (const rawLine of text.split(/\r?\n/)) {
    if (rules.length >= MAX_RULES) break;
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const sep = line.indexOf('=>');
    if (sep === -1) continue;

    const triggers = line
      .slice(0, sep)
      .split(',')
      .map(normalize)
      .filter(Boolean)
      .slice(0, MAX_TRIGGERS);
    const responses = line
      .slice(sep + 2)
      .split('|')
      .map((r) => r.trim().slice(0, MAX_RESPONSE_LENGTH))
      .filter(Boolean)
      .slice(0, MAX_RESPONSES);

    if (triggers.length && responses.length) rules.push({ triggers, responses });
  }
  return rules;
}

/** Regra cujo gatilho mais longo aparece na mensagem (null se nenhuma). */
function findRule(rules, message) {
  const haystack = ` ${normalize(message)} `;
  let best = null;
  let bestLength = 0;
  for (const rule of rules) {
    for (const trigger of rule.triggers) {
      if (trigger.length > bestLength && haystack.includes(` ${trigger} `)) {
        best = rule;
        bestLength = trigger.length;
      }
    }
  }
  return best;
}

function pickResponse(rule, rng = Math.random) {
  return rule.responses[Math.floor(rng() * rule.responses.length)];
}

module.exports = { normalize, parseRules, findRule, pickResponse };
