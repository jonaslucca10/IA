/**
 * MinhaIA — worker do modelo próprio
 * ------------------------------------------------------------
 * Carrega os pesos treinados neste repositório (model/own/) e
 * gera respostas com o motor em model/engine.mjs.
 *
 * Sem API, sem CDN, sem dependência externa: são arquivos do repo.
 */

import {
  loadTokenizer,
  loadModel,
  tensorsFromBuffer,
  createGenerator,
  buildPrompt,
  sampleTopK
} from './model/engine.mjs';

const BASE = 'model/own/';

let state = null;
let loading = null;
let interrupted = false;

const send = msg => self.postMessage(msg);

async function fetchJson(url) {
  const res = await fetch(url + '?v=1');
  if (!res.ok) throw new Error(`Falha ao carregar ${url} (HTTP ${res.status})`);
  return res.json();
}

async function loadAll() {
  if (state) return state;
  if (loading) return loading;

  loading = (async () => {
    const t0 = Date.now();
    send({ type: 'progress', phase: 'load', label: 'carregando tokenizer…' });

    const [cfg, tokJson] = await Promise.all([
      fetchJson(BASE + 'config.json'),
      fetchJson(BASE + 'tokenizer.json')
    ]);

    send({ type: 'progress', phase: 'load', label: 'carregando pesos (7 MB)…' });
    const res = await fetch(BASE + 'weights.bin?v=1');
    if (!res.ok) throw new Error(`Falha ao carregar os pesos (HTTP ${res.status})`);
    const buf = await res.arrayBuffer();

    send({ type: 'progress', phase: 'load', label: 'montando o modelo…' });
    const tokenizer = loadTokenizer(tokJson);
    const tensors = tensorsFromBuffer(cfg.tensors, buf);
    const model = loadModel(cfg, tensors);
    const gen = createGenerator(model, tokenizer, cfg);

    state = { cfg, tokenizer, model, gen };
    send({
      type: 'ready',
      params: cfg.params,
      ctx: cfg.ctx,
      vocab: cfg.vocab,
      ms: Date.now() - t0
    });
    return state;
  })();

  try {
    return await loading;
  } finally {
    loading = null;
  }
}

/** cabe o prompt na janela do modelo, cortando o começo da conversa */
function fitPrompt(tokenizer, messages, ctx, reserve) {
  const clean = messages.filter(m => m && m.content && String(m.content).trim());
  const system = clean.find(m => m.role === 'system');
  const convo = clean.filter(m => m.role !== 'system');

  // o modelo foi treinado com diálogos curtos: a "persona" entra resumida
  const persona = system ? String(system.content).replace(/\s+/g, ' ').trim().slice(0, 160) : '';
  let list = persona ? [{ role: 'user', content: persona }, ...convo] : [...convo];
  if (!list.length) list = [{ role: 'user', content: 'oi' }];

  let ids = buildPrompt(tokenizer, list);
  while (ids.length > ctx - reserve && list.length > 1) {
    list.shift();
    ids = buildPrompt(tokenizer, list);
  }

  // se ainda estourar, corta o texto da última mensagem
  if (ids.length > ctx - reserve) {
    const last = list[list.length - 1];
    const maxChars = Math.max(16, (ctx - reserve - 6) * 3);
    list = [{ role: last.role, content: String(last.content).slice(-maxChars) }];
    ids = buildPrompt(tokenizer, list);
  }
  return { ids, messages: list };
}

async function generate({ reqId, messages, options }) {
  const s = await loadAll();
  interrupted = false;

  const reserve = Math.max(24, Math.min(options?.maxNewTokens || 120, 160));
  const fitted = fitPrompt(s.tokenizer, messages, s.cfg.ctx, reserve);
  const promptIds = fitted.ids;
  const maxNew = Math.max(8, Math.min(options?.maxNewTokens || 120, s.cfg.ctx - promptIds.length - 2));

  s.model.reset();

  // processa o prompt
  let logits = null;
  for (const id of promptIds) {
    logits = s.model.step(id);
    if (!logits) break;
  }
  if (!logits) throw new Error('Prompt maior que a janela do modelo.');

  const out = [];
  let text = '';

  for (let i = 0; i < maxNew; i++) {
    if (interrupted) break;

    const id = sampleTopK(logits, {
      temperature: options?.temperature ?? 0.8,
      topK: options?.topK ?? 40,
      topP: options?.topP ?? 0.95,
      recent: out,
      repetitionPenalty: options?.repetitionPenalty ?? 1.15
    });

    const specials = s.tokenizer.specials;
    if (id === specials['<|end|>'] || id === specials['<|user|>'] || id === specials['<|endoftext|>']) break;

    out.push(id);
    const full = s.tokenizer.decode(out);
    if (full.length > text.length) {
      const delta = full.slice(text.length);
      text = full;
      send({ type: 'delta', reqId, text: delta });
    }

    logits = s.model.step(id);
    if (!logits) break;

    // cede o controle para permitir interrupção
    await new Promise(r => setTimeout(r, 0));
  }

  send({ type: 'done', reqId, text, interrupted });
}

self.onmessage = async event => {
  const msg = event.data || {};
  try {
    if (msg.type === 'load') {
      await loadAll();
    } else if (msg.type === 'generate') {
      await generate(msg);
    } else if (msg.type === 'interrupt') {
      interrupted = true;
    } else if (msg.type === 'ping') {
      send({ type: 'pong', ready: !!state });
    }
  } catch (err) {
    send({
      type: 'error',
      reqId: msg.reqId || null,
      message: String((err && err.message) || err)
    });
  }
};

send({ type: 'boot' });
