/**
 * Compara o motor JavaScript com a referência gerada pelo JAX.
 *
 *   node validate.mjs --own ../own --ref /tmp/ref.json
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  loadTokenizer,
  loadModel,
  tensorsFromBuffer,
  createGenerator,
  buildPrompt
} from '../engine.mjs';

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const ownDir = path.resolve(arg('own', '../own'));
const refPath = arg('ref', '/tmp/ref.json');

const cfg = JSON.parse(fs.readFileSync(path.join(ownDir, 'config.json'), 'utf8'));
const tokJson = JSON.parse(fs.readFileSync(path.join(ownDir, 'tokenizer.json'), 'utf8'));
const buf = fs.readFileSync(path.join(ownDir, 'weights.bin'));
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

const tokenizer = loadTokenizer(tokJson);
const tensors = tensorsFromBuffer(cfg.tensors, ab);
const model = loadModel(cfg, tensors);

const ref = JSON.parse(fs.readFileSync(refPath, 'utf8'));

/* 1) tokenizer */
const ids = tokenizer.encode(ref.text);
const idsMatch = ids.length === ref.ids.length && ids.every((v, i) => v === ref.ids[i]);
console.log('ids JS   :', ids.slice(0, 20).join(','));
console.log('ids JAX  :', ref.ids.slice(0, 20).join(','));
console.log('tokenizer:', idsMatch ? 'OK ✓' : `DIFERENTE ✗ (${ids.length} vs ${ref.ids.length})`);

/* round-trip */
const decoded = tokenizer.decode(ids);
console.log('decode   :', JSON.stringify(decoded.slice(0, 60)));
console.log('round-trip:', decoded.includes('quem é você') ? 'OK ✓' : 'falhou ✗');

/* 2) logits */
model.reset();
let logits = null;
for (const id of ids) logits = model.step(id);

let maxDiff = 0;
let inner = 0;
const n = Math.min(logits.length, ref.logits.length);
for (let i = 0; i < n; i++) {
  const d = Math.abs(logits[i] - ref.logits[i]);
  maxDiff = Math.max(maxDiff, d);
  inner += logits[i] * ref.logits[i];
}

console.log(`logits   : ${n} valores | maior diferença ${maxDiff.toExponential(2)}`);

const topJs = Array.from(logits.keys ? logits.keys() : [...Array(n).keys()])
  .sort((a, b) => logits[b] - logits[a]).slice(0, 10);
console.log('top10 JS :', topJs.join(','));
console.log('top10 JAX:', ref.top.join(','));
const overlap = topJs.filter(x => ref.top.includes(x)).length;
console.log(`top-10 iguais: ${overlap}/10 | produto interno: ${inner.toFixed(2)}`);

/* 3) geração */
const gen = createGenerator(model, tokenizer, cfg);
const prompt = buildPrompt(tokenizer, [{ role: 'user', content: 'oi, quem é você?' }]);
const out = gen.generate(prompt, { maxNewTokens: 40, temperature: 0.7, topK: 40 });
console.log('\nprompt ids:', prompt.length);
console.log('gerado:', JSON.stringify(tokenizer.decode(out)));

const ok = idsMatch && maxDiff < 0.05 && overlap >= 7;
console.log('\nRESULTADO:', ok ? 'motor JS confere com JAX ✓' : 'DIVERGÊNCIA ✗');
process.exit(ok ? 0 : 1);
