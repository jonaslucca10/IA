/**
 * MinhaIA — inferência local no navegador
 * ------------------------------------------------------------
 * Roda um modelo de linguagem dentro do próprio navegador via
 * Transformers.js (ONNX Runtime Web). O modelo é baixado do
 * Hugging Face na primeira vez e fica no cache do navegador.
 *
 * Nenhuma chave de API, nenhum servidor, nenhum dado saindo daqui.
 *
 * Este arquivo roda como Web Worker (module). A comunicação é por
 * postMessage — veja o protocolo em app.js (engine).
 */

const LIB_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2';

let libPromise = null;
function lib() {
  if (!libPromise) libPromise = import(LIB_URL);
  return libPromise;
}

/** @type {{modelId:string, device:string, dtype:string, generator:any}|null} */
let loaded = null;
let currentStopper = null;
let busy = false;

const send = msg => self.postMessage(msg);

/* ---------------- carregar modelo ---------------- */
async function load({ modelId, device }) {
  // libera o modelo anterior antes de baixar outro (memória)
  if (loaded) {
    try { if (loaded.generator?.dispose) await loaded.generator.dispose(); } catch { }
    loaded = null;
  }

  const { pipeline, env } = await lib();

  // usa o cache HTTP do navegador e o hub público
  env.allowLocalModels = false;
  env.useBrowserCache = true;

  const wantsGpu = device === 'webgpu' || device === 'auto';

  const attempts = [];
  if (wantsGpu) {
    attempts.push({ device: 'webgpu', dtype: 'q4f16' });
    attempts.push({ device: 'webgpu', dtype: 'q4' });
  }
  attempts.push({ device: 'wasm', dtype: 'q4' });
  attempts.push({ device: 'wasm', dtype: 'q8' });
  attempts.push({ device: 'wasm', dtype: 'fp32' });

  let lastErr = null;

  for (const attempt of attempts) {
    try {
      send({ type: 'progress', phase: 'load', label: `preparando ${attempt.device === 'webgpu' ? 'GPU' : 'CPU'} (${attempt.dtype})…` });

      const generator = await pipeline('text-generation', modelId, {
        ...attempt,
        progress_callback: info => {
          if (info.status === 'progress') {
            send({
              type: 'progress',
              phase: 'download',
              file: info.file,
              progress: info.progress,
              loaded: info.loaded,
              total: info.total
            });
          } else if (info.status === 'progress_total') {
            send({ type: 'progress', phase: 'total', progress: info.progress, loaded: info.loaded, total: info.total });
          } else if (info.status === 'done') {
            send({ type: 'progress', phase: 'file-done', file: info.file });
          }
        }
      });

      loaded = { modelId, device: attempt.device, dtype: attempt.dtype, generator };
      send({ type: 'loaded', modelId, device: attempt.device, dtype: attempt.dtype });
      return;
    } catch (err) {
      lastErr = err;
      const msg = String(err && err.message || err);
      send({ type: 'progress', phase: 'fallback', label: `${attempt.device}/${attempt.dtype} falhou — tentando outro modo` });
      console.warn('[MinhaIA] falha ao carregar', attempt, msg);
      // se o modelo simplesmente não existe, não adianta continuar tentando
      if (/not found|404|Unauthorized|Could not locate/i.test(msg)) break;
    }
  }

  throw lastErr || new Error('Não foi possível carregar o modelo.');
}

/* ---------------- gerar ---------------- */
async function generate({ reqId, messages, options }) {
  if (!loaded) throw new Error('Nenhum modelo carregado.');
  if (busy) throw new Error('Já existe uma geração em andamento.');

  const { TextStreamer, InterruptableStoppingCriteria } = await lib();
  busy = true;
  currentStopper = new InterruptableStoppingCriteria();

  const o = options || {};
  const temperature = Number.isFinite(o.temperature) ? o.temperature : 0.7;
  const doSample = temperature > 0.01;

  let text = '';
  try {
    const streamer = new TextStreamer(loaded.generator.tokenizer, {
      skip_prompt: true,
      skip_special_tokens: true,
      callback_function: piece => {
        text += piece;
        send({ type: 'delta', reqId, text: piece });
      }
    });

    const out = await loaded.generator(messages, {
      max_new_tokens: Math.max(16, Math.min(o.maxNewTokens || 512, 4096)),
      do_sample: doSample,
      ...(doSample ? { temperature } : {}),
      top_p: o.topP || 0.95,
      repetition_penalty: o.repetitionPenalty || 1.1,
      streamer,
      stopping_criteria: currentStopper
    });

    // fallback: se o streamer não emitiu nada, usa a saída final
    if (!text) {
      const last = Array.isArray(out) ? out[0]?.generated_text : null;
      if (typeof last === 'string') text = last;
      else if (Array.isArray(last)) text = last[last.length - 1]?.content || '';
    }

    send({ type: 'done', reqId, text, interrupted: !!currentStopper?.interrupted });
  } finally {
    busy = false;
    currentStopper = null;
  }
}

/* ---------------- protocolo ---------------- */
self.onmessage = async event => {
  const msg = event.data || {};

  try {
    if (msg.type === 'load') {
      await load(msg);
    } else if (msg.type === 'generate') {
      await generate(msg);
    } else if (msg.type === 'interrupt') {
      if (currentStopper) currentStopper.interrupt();
    } else if (msg.type === 'unload') {
      if (loaded?.generator?.dispose) {
        try { await loaded.generator.dispose(); } catch { }
      }
      loaded = null;
      send({ type: 'unloaded' });
    } else if (msg.type === 'ping') {
      send({ type: 'pong', loaded: loaded ? { modelId: loaded.modelId, device: loaded.device, dtype: loaded.dtype } : null });
    }
  } catch (err) {
    send({
      type: 'error',
      reqId: msg.reqId || null,
      phase: msg.type,
      message: String(err && err.message || err)
    });
  }
};

send({ type: 'boot' });
