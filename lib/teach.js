'use strict';

/**
 * Ensinar e esquecer pela conversa.
 *   "aprenda: quando eu disser oi, responda Olá, tudo bem!"
 *   "quando eu disser tchau responda até logo"
 *   "esqueça oi"
 * Essas funções só transformam o texto de regras; quem guarda o texto é o cliente.
 */

const { normalize } = require('./rules');

// Aceita variações naturais: "aprenda que quando eu falar X, você responde Y",
// "se eu disser X responda Y", "ensina isso: quando eu disser X, responda com Y".
const LEARN_RE = new RegExp(
  '^(?:(?:aprenda|aprende|ensine|ensina|guarde|guarda)\\s*(?:que|isso)?\\s*[:,]?\\s+)?' +
    '(?:quando|se|sempre que|toda vez que)\\s+(?:eu\\s+)?' +
    '(?:disser|falar|falo|digo|perguntar|pergunto|escrever|escrevo|mandar|mando|enviar|envio)\\s+' +
    '(.+?)[\\s,;:.]+' +
    '(?:(?:voc[eê]|assistente|a ia)\\s+)?(?:deve\\s+|precisa\\s+|pode\\s+)?' +
    '(?:responda|responde|respondo|responder|fale|fala|diga|diz)\\s*(?:com|isso)?\\s*[:,]?\\s+(.+)$',
  'is'
);

const FORGET_RE = new RegExp(
  '^(?:esque[cç]a|esquece|apague|apaga|remova|remove)\\s*(?:que|isso|a regra)?\\s*[:,]?\\s*' +
    '(?:(?:quando|se)\\s+)?(?:(?:eu\\s+)?(?:disser|falar|falo)\\s+)?(.+?)\\s*[.!]?$',
  'i'
);

// Mensagem que parece uma tentativa de ensinar, mas não foi entendida.
const TEACH_HINT_RE = /\b(aprenda|aprende|ensine|ensina)\b|^(?:quando|se)\s+(?:eu\s+)?(?:disser|falar|falo)\b.*\b(?:responda|responde)\b/i;

/** Remove separadores que quebrariam o formato "gatilhos => resposta". */
function cleanPart(text, separators = /=>|[,|]/g) {
  return String(text ?? '')
    .replace(separators, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseTeachCommand(message) {
  const text = String(message ?? '').trim();

  const learn = text.match(LEARN_RE);
  if (learn) {
    const trigger = cleanPart(learn[1]).replace(/[.!?]+$/, '').trim();
    const response = cleanPart(learn[2], /=>|\|/g); // a vírgula é permitida na resposta
    if (normalize(trigger) && normalize(response)) return { type: 'learn', trigger, response };
    return null;
  }

  const forget = text.match(FORGET_RE);
  if (forget) {
    const trigger = cleanPart(forget[1]);
    if (normalize(trigger)) return { type: 'forget', trigger };
  }

  if (TEACH_HINT_RE.test(text)) return { type: 'invalid' };
  return null;
}

/**
 * Remove um gatilho do texto de regras. Linhas com outros gatilhos continuam
 * valendo; comentários e linhas sem "=>" ficam intactos.
 */
function removeTrigger(text, trigger) {
  const target = normalize(trigger);
  return String(text ?? '')
    .split(/\r?\n/)
    .flatMap((raw) => {
      const line = raw.trim();
      if (!line || line.startsWith('#')) return [raw];
      const sep = line.indexOf('=>');
      if (sep === -1) return [raw];

      const original = line
        .slice(0, sep)
        .split(',')
        .map((t) => t.trim())
        .filter((t) => normalize(t));
      const kept = original.filter((t) => normalize(t) !== target);
      if (kept.length === original.length) return [raw];
      if (kept.length === 0) return [];
      return [`${kept.join(', ')} => ${line.slice(sep + 2).trim()}`];
    })
    .join('\n');
}

/** Ensina um gatilho: a regra nova substitui qualquer regra antiga com o mesmo gatilho. */
function applyLearn(text, trigger, response) {
  const base = removeTrigger(text, trigger).replace(/\n+$/, '');
  const line = `${trigger} => ${response}`;
  return base ? `${base}\n${line}` : line;
}

/** Esquece um gatilho. removed indica se algo foi de fato apagado. */
function applyForget(text, trigger) {
  const updated = removeTrigger(text, trigger);
  return { text: updated, removed: updated !== String(text ?? '') };
}

module.exports = { parseTeachCommand, removeTrigger, applyLearn, applyForget, TEACH_HINT_RE };
