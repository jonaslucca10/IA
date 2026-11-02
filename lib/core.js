'use strict';

/**
 * Lógica do assistente, compartilhada pelo servidor local (server.js)
 * e pela função da Vercel (api/chat.js). Não depende de nenhum serviço externo:
 *   1. se a mensagem casa com uma regra cadastrada, responde com ela;
 *   2. senão, o modelo próprio (n-gramas) gera uma resposta.
 */

const { parseRules, findRule, pickResponse } = require('./rules');
const { train, generate } = require('./ngram');
const { CORPUS } = require('./corpus');
const { parseTeachCommand, applyLearn, applyForget } = require('./teach');

const MAX_HISTORY = 40;
const MAX_NAME_LENGTH = 40;
const MAX_MESSAGE_LENGTH = 4000;
const FALLBACK_REPLY = 'Não entendi bem. Pode me dizer de outro jeito?';

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sanitizeName(input) {
  const name = typeof input === 'string' ? input.trim() : '';
  return (name || 'Assistente').slice(0, MAX_NAME_LENGTH);
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

let cachedModel = null;
function getModel() {
  if (!cachedModel) cachedModel = train(CORPUS);
  return cachedModel;
}

/**
 * Recebe o corpo já parseado e devolve { reply, source, name }.
 * source é 'rule' (resposta cadastrada), 'model' (modelo próprio) ou 'teach'
 * (ensinar/esquecer). Em 'teach', rules traz o novo texto de regras.
 */
function runChat(body, { rng = Math.random, model = getModel() } = {}) {
  const name = sanitizeName(body?.name);
  const rulesText = Array.isArray(body?.rules)
    ? body.rules.join('\n')
    : typeof body?.rules === 'string'
      ? body.rules
      : '';
  const history = sanitizeMessages(body?.messages);
  if (!history.length || history[history.length - 1].role !== 'user') {
    throw new HttpError(400, 'Envie ao menos uma mensagem do usuário.');
  }
  const message = history[history.length - 1].content;

  const teach = parseTeachCommand(message);
  if (teach?.type === 'learn') {
    return {
      reply: `Aprendi! Quando você disser "${teach.trigger}", eu respondo "${teach.response}".`,
      source: 'teach',
      name,
      rules: applyLearn(rulesText, teach.trigger, teach.response),
    };
  }
  if (teach?.type === 'forget') {
    const result = applyForget(rulesText, teach.trigger);
    return {
      reply: result.removed
        ? `Pronto, esqueci "${teach.trigger}".`
        : `Eu não tinha aprendido "${teach.trigger}".`,
      source: 'teach',
      name,
      rules: result.text,
    };
  }

  const rules = parseRules(rulesText);
  const rule = findRule(rules, message);
  if (rule) {
    const reply = pickResponse(rule, rng).replace(/\{nome\}/gi, name);
    return { reply, source: 'rule', name };
  }

  const generated = generate(model, rng);
  return { reply: generated || FALLBACK_REPLY, source: 'model', name };
}

module.exports = { HttpError, sanitizeName, sanitizeMessages, runChat };
