/**
 * MinhaIA — motor de inferência do modelo próprio
 * ------------------------------------------------------------
 * Um GPT pequeno implementado à mão: tokenizer BPE byte-level,
 * forward pass com cache de KV e amostragem (temperatura/top-k/top-p).
 *
 * Não usa ONNX, Transformers.js, WebGPU nem biblioteca nenhuma.
 * O mesmo arquivo roda no navegador (Web Worker) e no Node (testes).
 *
 * Arquitetura (igual à do treino em model/train/train.py):
 *   embeddings de token + posição
 *   N × [LayerNorm -> atenção causal multi-head -> residual
 *        LayerNorm -> MLP GELU 4x -> residual]
 *   LayerNorm final -> logits (peso amarrado ao embedding)
 */

/* ------------------------------------------------------------------ */
/* tokenizer                                                          */
/* ------------------------------------------------------------------ */

// GPT-2 byte <-> unicode
function bytesToUnicode() {
  const bs = [];
  for (let i = 33; i <= 126; i++) bs.push(i);
  for (let i = 161; i <= 172; i++) bs.push(i);
  for (let i = 174; i <= 255; i++) bs.push(i);
  const cs = bs.slice();
  let n = 0;
  for (let b = 0; b < 256; b++) {
    if (!bs.includes(b)) {
      bs.push(b);
      cs.push(256 + n);
      n++;
    }
  }
  const map = new Map();
  for (let i = 0; i < bs.length; i++) map.set(bs[i], String.fromCharCode(cs[i]));
  return map;
}

const BYTE_TO_CHAR = bytesToUnicode();
const CHAR_TO_BYTE = new Map();
for (const [b, c] of BYTE_TO_CHAR) CHAR_TO_BYTE.set(c, b);

// regex de pré-tokenização do GPT-2
const SPLIT_RE = /'s|'t|'re|'ve|'m|'ll|'d| ?\p{L}+| ?\p{N}+| ?[^\s\p{L}\p{N}]+|\s+(?!\S)|\s+/gu;

export function loadTokenizer(data) {
  const vocab = data.vocab; // token (string) -> id
  const idToToken = new Array(data.vocabSize);
  for (const [tok, id] of Object.entries(vocab)) idToToken[id] = tok;

  const ranks = new Map();
  data.merges.forEach((pair, i) => ranks.set(pair, i));

  const specials = data.specials || {};
  const specialList = Object.entries(specials)
    .map(([name, id]) => ({ name, id }))
    .sort((a, b) => b.name.length - a.name.length);

  // cache de palavras -> ids
  const cache = new Map();

  function bpeWord(word) {
    let chars = Array.from(word);
    let parts = chars;
    // pares iniciais
    let pairs = new Map();
    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts[i] + ' ' + parts[i + 1];
      pairs.set(key, (pairs.get(key) || 0) + 1);
    }
    while (parts.length > 1) {
      let bestKey = null;
      let bestRank = Infinity;
      for (const key of pairs.keys()) {
        const r = ranks.get(key);
        if (r !== undefined && r < bestRank) { bestRank = r; bestKey = key; }
      }
      if (bestKey === null) break;

      const [a, b] = bestKey.split(' ');
      const merged = [];
      let i = 0;
      while (i < parts.length) {
        if (i < parts.length - 1 && parts[i] === a && parts[i + 1] === b) {
          merged.push(a + b);
          i += 2;
        } else {
          merged.push(parts[i]);
          i += 1;
        }
      }
      parts = merged;
      pairs = new Map();
      for (let j = 0; j < parts.length - 1; j++) {
        const key = parts[j] + ' ' + parts[j + 1];
        pairs.set(key, (pairs.get(key) || 0) + 1);
      }
      if (!pairs.size) break;
    }
    return parts;
  }

  function encodeText(text) {
    const out = [];
    for (const m of text.matchAll(SPLIT_RE)) {
      const word = m[0];
      if (!word) continue;
      const cached = cache.get(word);
      if (cached) { out.push(...cached); continue; }

      // bytes -> chars mapeados
      const bytes = new TextEncoder().encode(word);
      let mapped = '';
      for (const b of bytes) mapped += BYTE_TO_CHAR.get(b);

      const pieces = bpeWord(mapped);
      const ids = pieces.map(p => {
        const id = vocab[p];
        return id === undefined ? -1 : id;
      }).filter(id => id >= 0);

      cache.set(word, ids);
      out.push(...ids);
    }
    return out;
  }

  function encode(text) {
    // respeita tokens especiais no meio do texto
    const ids = [];
    let rest = String(text);
    while (rest.length) {
      let hit = null;
      let hitAt = Infinity;
      for (const s of specialList) {
        const at = rest.indexOf(s.name);
        if (at >= 0 && at < hitAt) { hitAt = at; hit = s; }
      }
      if (!hit) { ids.push(...encodeText(rest)); break; }
      if (hitAt > 0) ids.push(...encodeText(rest.slice(0, hitAt)));
      ids.push(hit.id);
      rest = rest.slice(hitAt + hit.name.length);
    }
    return ids;
  }

  function decode(ids) {
    let bytes = [];
    for (const id of ids) {
      const tok = idToToken[id];
      if (tok === undefined) continue;
      // token especial: sai como texto
      const sp = Object.entries(specials).find(([, v]) => v === id);
      if (sp) {
        bytes.push(...new TextEncoder().encode(sp[0]));
        continue;
      }
      for (const ch of tok) {
        const b = CHAR_TO_BYTE.get(ch);
        if (b !== undefined) bytes.push(b);
      }
    }
    return new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(bytes));
  }

  return { encode, decode, specials };
}

/* ------------------------------------------------------------------ */
/* utilitários numéricos                                              */
/* ------------------------------------------------------------------ */

function fp16ToFloat32(u16) {
  const out = new Float32Array(u16.length);
  for (let i = 0; i < u16.length; i++) {
    const h = u16[i];
    const s = (h & 0x8000) ? -1 : 1;
    const e = (h & 0x7c00) >> 10;
    const f = h & 0x03ff;
    if (e === 0) out[i] = s * 6.103515625e-5 * (f / 1024);
    else if (e === 0x1f) out[i] = f ? NaN : s * Infinity;
    else out[i] = s * Math.pow(2, e - 15) * (1 + f / 1024);
  }
  return out;
}

function layerNorm(x, g, b, D, eps = 1e-5) {
  let mean = 0;
  for (let i = 0; i < D; i++) mean += x[i];
  mean /= D;
  let v = 0;
  for (let i = 0; i < D; i++) { const d = x[i] - mean; v += d * d; }
  v /= D;
  const inv = 1 / Math.sqrt(v + eps);
  for (let i = 0; i < D; i++) x[i] = (x[i] - mean) * inv * g[i] + b[i];
}

function gelu(x) {
  return 0.5 * x * (1 + Math.tanh(0.7978845608 * (x + 0.044715 * x * x * x)));
}

/** out = x @ W + b, W com layout [nIn, nOut] */
function matvec(x, W, b, out, nIn, nOut) {
  for (let j = 0; j < nOut; j++) out[j] = b ? b[j] : 0;
  for (let i = 0; i < nIn; i++) {
    const xi = x[i];
    if (xi === 0) continue;
    const row = i * nOut;
    for (let j = 0; j < nOut; j++) out[j] += xi * W[row + j];
  }
}

export function tensorsFromBuffer(manifest, buffer) {
  const map = new Map();
  for (const t of manifest) {
    const half = new Uint16Array(buffer, t.offset, t.count);
    map.set(t.name, fp16ToFloat32(half));
  }
  return map;
}

/* ------------------------------------------------------------------ */
/* modelo                                                             */
/* ------------------------------------------------------------------ */

export function loadModel(cfg, tensors) {
  const { vocab, ctx, d_model: D, n_layer: L, n_head: H, d_ff: FF } = cfg;
  const hd = D / H;

  const g = {
    wte: tensors.get('wte'),
    wpe: tensors.get('wpe'),
    lnf_g: tensors.get('lnf_g'),
    lnf_b: tensors.get('lnf_b'),
    layers: []
  };
  for (let i = 0; i < L; i++) {
    const p = `l${i}.`;
    g.layers.push({
      ln1_g: tensors.get(p + 'ln1_g'), ln1_b: tensors.get(p + 'ln1_b'),
      wq: tensors.get(p + 'wq'), bq: tensors.get(p + 'bq'),
      wk: tensors.get(p + 'wk'), bk: tensors.get(p + 'bk'),
      wv: tensors.get(p + 'wv'), bv: tensors.get(p + 'bv'),
      wo: tensors.get(p + 'wo'), bo: tensors.get(p + 'bo'),
      ln2_g: tensors.get(p + 'ln2_g'), ln2_b: tensors.get(p + 'ln2_b'),
      w1: tensors.get(p + 'w1'), b1: tensors.get(p + 'b1'),
      w2: tensors.get(p + 'w2'), b2: tensors.get(p + 'b2')
    });
  }

  // buffers reaproveitados
  const x = new Float32Array(D);
  const h = new Float32Array(D);
  const h2 = new Float32Array(FF);
  const q = new Float32Array(D);
  const k = new Float32Array(D);
  const v = new Float32Array(D);
  const att = new Float32Array(D);
  const probs = new Float32Array(ctx);
  const logits = new Float32Array(vocab);

  // cache de KV
  const K = [], V = [];
  for (let l = 0; l < L; l++) {
    K.push(new Float32Array(ctx * D));
    V.push(new Float32Array(ctx * D));
  }

  let pos = 0;

  function reset() { pos = 0; }
  function cancel() { pos = 0; }
  function position() { return pos; }

  /** processa um token na posição atual e devolve os logits */
  function step(tokenId) {
    if (pos >= ctx) return null;

    const p = pos;
    // embedding de token + posição
    const er = tokenId * D;
    const pr = p * D;
    for (let i = 0; i < D; i++) x[i] = g.wte[er + i] + g.wpe[pr + i];

    for (let l = 0; l < L; l++) {
      const lay = g.layers[l];
      const Kc = K[l];
      const Vc = V[l];
      const base = p * D;

      // ---- atenção ----
      for (let i = 0; i < D; i++) h[i] = x[i];
      layerNorm(h, lay.ln1_g, lay.ln1_b, D);

      matvec(h, lay.wq, lay.bq, q, D, D);
      matvec(h, lay.wk, lay.bk, k, D, D);
      matvec(h, lay.wv, lay.bv, v, D, D);

      Kc.set(k, base);
      Vc.set(v, base);

      for (let head = 0; head < H; head++) {
        const off = head * hd;
        let maxv = -Infinity;
        for (let t = 0; t <= p; t++) {
          let s = 0;
          const kb = t * D + off;
          for (let d = 0; d < hd; d++) s += q[off + d] * Kc[kb + d];
          s /= Math.sqrt(hd);
          probs[t] = s;
          if (s > maxv) maxv = s;
        }
        let sum = 0;
        for (let t = 0; t <= p; t++) { const e = Math.exp(probs[t] - maxv); probs[t] = e; sum += e; }
        const inv = 1 / sum;
        for (let d = 0; d < hd; d++) att[off + d] = 0;
        for (let t = 0; t <= p; t++) {
          const w = probs[t] * inv;
          if (w < 1e-6) continue;
          const vb = t * D + off;
          for (let d = 0; d < hd; d++) att[off + d] += w * Vc[vb + d];
        }
      }

      matvec(att, lay.wo, lay.bo, h, D, D);
      for (let i = 0; i < D; i++) x[i] += h[i];

      // ---- MLP ----
      for (let i = 0; i < D; i++) h[i] = x[i];
      layerNorm(h, lay.ln2_g, lay.ln2_b, D);
      matvec(h, lay.w1, lay.b1, h2, D, FF);
      for (let i = 0; i < FF; i++) h2[i] = gelu(h2[i]);
      matvec(h2, lay.w2, lay.b2, h, FF, D);
      for (let i = 0; i < D; i++) x[i] += h[i];
    }

    // ---- norma final + projeção para o vocabulário (peso amarrado) ----
    layerNorm(x, g.lnf_g, g.lnf_b, D);
    for (let t = 0; t < vocab; t++) {
      const row = t * D;
      let s = 0;
      for (let i = 0; i < D; i++) s += x[i] * g.wte[row + i];
      logits[t] = s;
    }

    pos += 1;
    return logits;
  }

  return { step, reset, cancel, position, cfg };
}

/* ------------------------------------------------------------------ */
/* amostragem                                                         */
/* ------------------------------------------------------------------ */

function softmaxInPlace(arr, n, temperature) {
  let maxv = -Infinity;
  for (let i = 0; i < n; i++) {
    arr[i] /= temperature;
    if (arr[i] > maxv) maxv = arr[i];
  }
  let sum = 0;
  for (let i = 0; i < n; i++) { const e = Math.exp(arr[i] - maxv); arr[i] = e; sum += e; }
  for (let i = 0; i < n; i++) arr[i] /= sum;
}

export function sampleTopK(logits, { temperature = 0.8, topK = 40, topP = 0.95, recent = [], repetitionPenalty = 1.1 }) {
  const n = logits.length;
  const scores = new Float32Array(n);
  for (let i = 0; i < n; i++) scores[i] = logits[i];

  // penalidade de repetição simples
  if (repetitionPenalty && repetitionPenalty !== 1) {
    const seen = new Set(recent.slice(-64));
    for (const id of seen) {
      if (scores[id] > 0) scores[id] /= repetitionPenalty;
      else scores[id] *= repetitionPenalty;
    }
  }

  // top-k
  let indices = null;
  if (topK && topK < n) {
    indices = Array.from({ length: n }, (_, i) => i);
    indices.sort((a, b) => scores[b] - scores[a]);
    indices = indices.slice(0, topK);
  } else {
    indices = Array.from({ length: n }, (_, i) => i);
  }

  const vals = indices.map(i => scores[i] / Math.max(temperature, 1e-5));
  const maxv = Math.max(...vals);
  let sum = 0;
  const probs = vals.map(v => { const e = Math.exp(v - maxv); sum += e; return e; });
  for (let i = 0; i < probs.length; i++) probs[i] /= sum;

  // nucleus (top-p)
  if (topP && topP < 1) {
    const order = probs.map((p, i) => [p, i]).sort((a, b) => b[0] - a[0]);
    let acc = 0;
    const keep = [];
    for (const [p, i] of order) {
      keep.push(i);
      acc += p;
      if (acc >= topP) break;
    }
    const set = new Set(keep);
    let s2 = 0;
    for (let i = 0; i < probs.length; i++) { if (!set.has(i)) probs[i] = 0; s2 += probs[i]; }
    for (let i = 0; i < probs.length; i++) probs[i] /= s2;
  }

  let r = Math.random();
  for (let i = 0; i < probs.length; i++) {
    r -= probs[i];
    if (r <= 0) return indices[i];
  }
  return indices[indices.length - 1];
}

/* ------------------------------------------------------------------ */
/* geração                                                            */
/* ------------------------------------------------------------------ */

export function createGenerator(model, tokenizer, cfg) {
  // tokens que encerram a resposta
  const stopIds = new Set([
    tokenizer.specials['<|end|>'],
    tokenizer.specials['<|user|>'],
    tokenizer.specials['<|endoftext|>']
  ].filter(v => typeof v === 'number'));

  // o modelo às vezes repete o marcador de fala: ignora no começo, encerra depois
  const assistantId = tokenizer.specials['<|assistant|>'];

  /**
   * Gera tokens a partir de um prompt já tokenizado.
   * onToken(id) é chamado a cada token — o texto é decodificado por quem chama.
   */
  function generate(promptIds, options = {}) {
    const maxNew = Math.min(options.maxNewTokens || 120, cfg.ctx - promptIds.length - 1);
    const temperature = options.temperature ?? 0.8;
    const topK = options.topK ?? 40;
    const topP = options.topP ?? 0.95;

    model.reset();
    let logits = null;
    let last = promptIds[0];

    for (let i = 0; i < promptIds.length; i++) {
      logits = model.step(promptIds[i]);
      last = promptIds[i];
      if (!logits) break;
    }
    if (!logits) return [];

    const out = [];
    const recent = [...promptIds];
    for (let i = 0; i < maxNew; i++) {
      const id = sampleTopK(logits, { temperature, topK, topP, recent });
      if (stopIds.has(id)) break;

      if (id === assistantId) {
        if (out.length) break;            // marcador no meio: encerra
        logits = model.step(id);          // marcador no começo: pula
        if (!logits) break;
        continue;
      }

      out.push(id);
      recent.push(id);
      logits = model.step(id);
      if (!logits) break;
      if (options.shouldStop && options.shouldStop(out)) break;
    }
    return out;
  }

  return { generate };
}

/** monta o prompt no mesmo formato usado no treino */
export function buildPrompt(tokenizer, messages) {
  const sp = tokenizer.specials;
  const ids = [];
  ids.push(sp['<|endoftext|>']);
  ids.push(...tokenizer.encode('\n'));
  for (const m of messages) {
    if (m.role === 'system') {
      // o modelo não foi treinado com "system": entra como primeira fala do usuário
      ids.push(sp['<|user|>']);
      ids.push(...tokenizer.encode(' ' + m.content + ' '));
      continue;
    }
    if (m.role === 'user') {
      ids.push(sp['<|user|>']);
      ids.push(...tokenizer.encode(' ' + m.content + ' '));
    } else if (m.role === 'assistant') {
      ids.push(sp['<|assistant|>']);
      ids.push(...tokenizer.encode(' ' + m.content + ' '));
    }
  }
  ids.push(sp['<|assistant|>']);
  ids.push(...tokenizer.encode(' '));
  return ids;
}
