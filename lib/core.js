'use strict';

/** Lógica compartilhada: usada pelo servidor local (server.js) e pelas funções da Vercel (api/). */

const MAX_HISTORY = 40;
const MAX_RULES = 50;
const MAX_RULE_LENGTH = 500;
const MAX_NAME_LENGTH = 40;
const MAX_MESSAGE_LENGTH = 4000;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Aceita string (uma regra por linha) ou array de strings. */
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

/** Endereços locais (ex.: Ollama) não precisam de chave de API. */
function requiresApiKey(baseUrl) {
  try {
    const host = new URL(baseUrl).hostname;
    return !['localhost', '127.0.0.1', '::1', '[::1]'].includes(host);
  } catch {
    return true;
  }
}

/** Configuração do provedor a partir de variáveis de ambiente (ou overrides). */
function llmConfig(overrides = {}, env = process.env) {
  return {
    baseUrl: (overrides.baseUrl ?? env.LLM_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/+$/, ''),
    apiKey: overrides.apiKey ?? env.LLM_API_KEY ?? '',
    model: overrides.model ?? env.LLM_MODEL ?? 'gpt-4o-mini',
  };
}

function isConfigured(config) {
  return !requiresApiKey(config.baseUrl) || Boolean(config.apiKey);
}

async function callLLM(config, messages) {
  if (!isConfigured(config)) {
    throw new HttpError(
      503,
      'Nenhuma chave de IA configurada. Defina LLM_API_KEY nas variáveis de ambiente do servidor e faça um novo deploy (ou reinicie o servidor).'
    );
  }
  const headers = { 'Content-Type': 'application/json' };
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

  let response;
  try {
    response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: config.model, messages, temperature: 0.7 }),
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

/** Recebe o corpo já parseado e devolve a resposta do assistente. */
async function runChat(config, body) {
  const name = sanitizeName(body?.name);
  const rules = sanitizeRules(body?.rules);
  const history = sanitizeMessages(body?.messages);
  if (!history.length || history[history.length - 1].role !== 'user') {
    throw new HttpError(400, 'Envie ao menos uma mensagem do usuário.');
  }
  const messages = [{ role: 'system', content: buildSystemPrompt({ name, rules }) }, ...history];
  const reply = await callLLM(config, messages);
  return { reply, name };
}

module.exports = {
  HttpError,
  sanitizeRules,
  sanitizeName,
  sanitizeMessages,
  buildSystemPrompt,
  requiresApiKey,
  llmConfig,
  isConfigured,
  callLLM,
  runChat,
};
