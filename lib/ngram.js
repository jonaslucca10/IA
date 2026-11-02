'use strict';

/**
 * Modelo próprio de linguagem por n-gramas (trigramas de palavras).
 * Não usa rede neural nem serviço externo: aprende as sequências de palavras
 * do texto de treino e gera frases novas com elas. Com pouco texto, as frases
 * ficam curtas e repetitivas; quanto mais texto seu, melhor.
 */

const START = '<s>';
const END = '<e>';

function ctxKey(a, b) {
  return `${a}\u0001${b}`;
}

function tokenizeSentences(text) {
  return String(text ?? '')
    .split(/[.!?;:\n]+/)
    .map((s) =>
      s
        .split(/[\s,"()]+/)
        .map((w) => w.toLowerCase().trim())
        .filter(Boolean)
    )
    .filter((words) => words.length > 0);
}

/** Treina o modelo a partir de um texto. Retorna { transitions: Map }. */
function train(text) {
  const transitions = new Map();
  const add = (key, next) => {
    const list = transitions.get(key);
    if (list) list.push(next);
    else transitions.set(key, [next]);
  };
  for (const words of tokenizeSentences(text)) {
    let a = START;
    let b = START;
    for (const w of words) {
      add(ctxKey(a, b), w);
      a = b;
      b = w;
    }
    add(ctxKey(a, b), END);
  }
  return { transitions };
}

/** Gera uma frase. Retorna '' se o modelo não tiver nada para dizer. */
function generate(model, rng = Math.random, maxWords = 25) {
  const attempt = () => {
    let a = START;
    let b = START;
    const out = [];
    while (out.length < maxWords) {
      const options = model.transitions.get(ctxKey(a, b));
      if (!options || !options.length) break;
      const next = options[Math.floor(rng() * options.length)];
      if (next === END) break;
      out.push(next);
      a = b;
      b = next;
    }
    return out;
  };

  // Tenta algumas vezes para evitar frases de uma palavra só.
  let best = [];
  for (let i = 0; i < 8; i++) {
    const words = attempt();
    if (words.length > best.length) best = words;
    if (best.length >= 4) break;
  }
  if (!best.length) return '';
  const sentence = best.join(' ');
  return sentence.charAt(0).toUpperCase() + sentence.slice(1) + '.';
}

module.exports = { train, generate, tokenizeSentences };
