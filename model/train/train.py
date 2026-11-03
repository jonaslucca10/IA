#!/usr/bin/env python3
"""
Treina o modelo de linguagem próprio (GPT pequeno) do zero, em JAX, na CPU.

Arquitetura: decoder-only transformer
  - embeddings de token + posição (aprendidas)
  - LayerNorm pré-norm
  - atenção causal multi-head
  - MLP GELU 4x
  - cabeça de saída amarrada ao embedding de tokens

Uso:
    python train.py --tokens tokens.bin --steps 3000 --out checkpoints
"""
import argparse
import functools
import json
import math
import os
import time
from typing import NamedTuple

import numpy as np
import jax
import jax.numpy as jnp
import optax


class Config(NamedTuple):
    vocab: int
    ctx: int
    d_model: int
    n_layer: int
    n_head: int
    d_ff: int
    dropout: float = 0.0


def param_count(cfg: Config) -> int:
    emb = cfg.vocab * cfg.d_model + cfg.ctx * cfg.d_model
    per_layer = 4 * cfg.d_model * cfg.d_model + 2 * cfg.d_model * cfg.d_ff + 3 * cfg.d_model
    return emb + cfg.n_layer * per_layer + cfg.d_model


def init_params(key, cfg: Config):
    def lin(k, n_in, n_out, scale=0.02):
        return jax.random.normal(k, (n_in, n_out), jnp.float32) * scale

    keys = jax.random.split(key, 3 + cfg.n_layer * 6 + 3)
    i = 0

    params = {
        "wte": jax.random.normal(keys[i], (cfg.vocab, cfg.d_model), jnp.float32) * 0.02,
        "wpe": jax.random.normal(keys[i + 1], (cfg.ctx, cfg.d_model), jnp.float32) * 0.01,
    }
    i += 2

    layers = []
    for _ in range(cfg.n_layer):
        layer = {
            "ln1_g": jnp.ones(cfg.d_model), "ln1_b": jnp.zeros(cfg.d_model),
            "wq": lin(keys[i], cfg.d_model, cfg.d_model), "bq": jnp.zeros(cfg.d_model),
            "wk": lin(keys[i + 1], cfg.d_model, cfg.d_model), "bk": jnp.zeros(cfg.d_model),
            "wv": lin(keys[i + 2], cfg.d_model, cfg.d_model), "bv": jnp.zeros(cfg.d_model),
            "wo": lin(keys[i + 3], cfg.d_model, cfg.d_model), "bo": jnp.zeros(cfg.d_model),
            "ln2_g": jnp.ones(cfg.d_model), "ln2_b": jnp.zeros(cfg.d_model),
            "w1": lin(keys[i + 4], cfg.d_model, cfg.d_ff), "b1": jnp.zeros(cfg.d_ff),
            "w2": lin(keys[i + 5], cfg.d_ff, cfg.d_model), "b2": jnp.zeros(cfg.d_model),
        }
        layers.append(layer)
        i += 6
    params["layers"] = layers
    params["lnf_g"] = jnp.ones(cfg.d_model)
    params["lnf_b"] = jnp.zeros(cfg.d_model)
    return params


def layer_norm(x, g, b, eps=1e-5):
    mean = jnp.mean(x, axis=-1, keepdims=True)
    var = jnp.var(x, axis=-1, keepdims=True)
    return (x - mean) / jnp.sqrt(var + eps) * g + b


def gelu(x):
    return 0.5 * x * (1.0 + jnp.tanh(0.7978845608 * (x + 0.044715 * x * x * x)))


def attention(layer, x, cfg: Config):
    B, T, D = x.shape
    H, hd = cfg.n_head, D // cfg.n_head

    q = (x @ layer["wq"] + layer["bq"]).reshape(B, T, H, hd)
    k = (x @ layer["wk"] + layer["bk"]).reshape(B, T, H, hd)
    v = (x @ layer["wv"] + layer["bv"]).reshape(B, T, H, hd)

    scores = jnp.einsum("bthd,bshd->bhts", q, k) / math.sqrt(hd)
    mask = jnp.tril(jnp.ones((T, T), dtype=bool))
    scores = jnp.where(mask, scores, -1e9)
    probs = jax.nn.softmax(scores, axis=-1)
    out = jnp.einsum("bhts,bshd->bthd", probs, v).reshape(B, T, D)
    return out @ layer["wo"] + layer["bo"]


def block(layer, x, cfg: Config):
    x = x + attention(layer, layer_norm(x, layer["ln1_g"], layer["ln1_b"]), cfg)
    h = layer_norm(x, layer["ln2_g"], layer["ln2_b"])
    h = gelu(h @ layer["w1"] + layer["b1"]) @ layer["w2"] + layer["b2"]
    return x + h


def forward(params, idx, cfg: Config):
    B, T = idx.shape
    x = params["wte"][idx] + params["wpe"][:T]
    for layer in params["layers"]:
        x = block(layer, x, cfg)
    x = layer_norm(x, params["lnf_g"], params["lnf_b"])
    # peso amarrado: mesma matriz do embedding
    return x @ params["wte"].T


def loss_fn(params, idx, targets, cfg: Config):
    logits = forward(params, idx, cfg)
    logits = logits.reshape(-1, cfg.vocab).astype(jnp.float32)
    targets = targets.reshape(-1)
    logp = jax.nn.log_softmax(logits, axis=-1)
    nll = -jnp.take_along_axis(logp, targets[:, None], axis=1).mean()
    return nll, logits


@functools.partial(jax.jit, static_argnums=(4,))
def train_step(params, opt_state, idx, targets, cfg: Config):
    (loss, _), grads = jax.value_and_grad(loss_fn, has_aux=True)(params, idx, targets, cfg)
    updates, opt_state = OPTIM.update(grads, opt_state, params)
    params = optax.apply_updates(params, updates)
    return params, opt_state, loss


@functools.partial(jax.jit, static_argnums=(3,))
def eval_loss(params, idx, targets, cfg: Config):
    loss, _ = loss_fn(params, idx, targets, cfg)
    return loss


OPTIM = None


def make_optimizer(steps: int, lr: float, warmup: int, wd: float):
    schedule = optax.warmup_cosine_decay_schedule(
        init_value=lr * 0.05, peak_value=lr, warmup_steps=min(warmup, max(steps // 4, 1)),
        decay_steps=max(steps, 2), end_value=lr * 0.05,
    )
    return optax.chain(optax.clip_by_global_norm(1.0), optax.adamw(schedule, weight_decay=wd, b1=0.9, b2=0.95))


def sample_batch(tokens, cfg: Config, batch: int, rng: np.random.Generator):
    n = tokens.size
    starts = rng.integers(0, n - cfg.ctx - 1, size=batch)
    idx = np.stack([tokens[s:s + cfg.ctx] for s in starts]).astype(np.int32)
    tgt = np.stack([tokens[s + 1:s + cfg.ctx + 1] for s in starts]).astype(np.int32)
    return idx, tgt


def save_params(params, path, cfg: Config):
    flat = {}
    flat["wte"] = np.asarray(params["wte"])
    flat["wpe"] = np.asarray(params["wpe"])
    flat["lnf_g"] = np.asarray(params["lnf_g"])
    flat["lnf_b"] = np.asarray(params["lnf_b"])
    for i, layer in enumerate(params["layers"]):
        for k, v in layer.items():
            flat[f"l{i}.{k}"] = np.asarray(v)
    np.savez(path, **flat)
    json.dump(cfg._asdict(), open(path + ".config.json", "w"), indent=2)


@functools.partial(jax.jit, static_argnums=(2,))
def _gen_step(params, ids, cfg: Config):
    return forward(params, ids, cfg)[:, -1, :]


def generate(params, tok, prompt_ids, cfg: Config, n_new=80, temp=0.8, seed=0, top_k=40):
    rng = np.random.default_rng(seed)
    ids = list(prompt_ids)[-cfg.ctx:]
    for _ in range(n_new):
        x = jnp.array([ids[-cfg.ctx:]])
        logits = np.asarray(_gen_step(params, x, cfg))[0].astype(np.float64)
        logits = logits / max(temp, 1e-6)
        if top_k and top_k < logits.size:
            cut = np.sort(logits)[-top_k]
            logits = np.where(logits < cut, -1e9, logits)
        p = np.exp(logits - logits.max())
        p = p / p.sum()
        nxt = int(rng.choice(len(p), p=p))
        ids.append(nxt)
        yield nxt


def main():
    global OPTIM
    ap = argparse.ArgumentParser()
    ap.add_argument("--tokens", default="tokens.bin")
    ap.add_argument("--tokenizer", default="tokenizer.json")
    ap.add_argument("--out", default="checkpoints")
    ap.add_argument("--steps", type=int, default=3000)
    ap.add_argument("--batch", type=int, default=16)
    ap.add_argument("--ctx", type=int, default=256)
    ap.add_argument("--d_model", type=int, default=256)
    ap.add_argument("--n_layer", type=int, default=6)
    ap.add_argument("--n_head", type=int, default=8)
    ap.add_argument("--lr", type=float, default=1e-3)
    ap.add_argument("--warmup", type=int, default=120)
    ap.add_argument("--wd", type=float, default=0.1)
    ap.add_argument("--save-every", type=int, default=250)
    ap.add_argument("--log-every", type=int, default=25)
    ap.add_argument("--resume", default="")
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    tokens = np.fromfile(args.tokens, dtype=np.uint16)
    cfg = Config(vocab=8192, ctx=args.ctx, d_model=args.d_model, n_layer=args.n_layer,
                 n_head=args.n_head, d_ff=4 * args.d_model)
    print(f"tokens: {tokens.size:,} | parâmetros: {param_count(cfg):,}")

    OPTIM = make_optimizer(args.steps, args.lr, args.warmup, args.wd)

    rng = np.random.default_rng(42)
    key = jax.random.PRNGKey(0)
    params = init_params(key, cfg)
    opt_state = OPTIM.init(params)

    if args.resume and os.path.exists(args.resume):
        data = np.load(args.resume)
        def rebuild(prefix, n):
            return {k: jnp.asarray(data[f"{prefix}.{k}"]) for k in n}
        params["wte"] = jnp.asarray(data["wte"])
        params["wpe"] = jnp.asarray(data["wpe"])
        params["lnf_g"] = jnp.asarray(data["lnf_g"])
        params["lnf_b"] = jnp.asarray(data["lnf_b"])
        params["layers"] = [rebuild(f"l{i}", params["layers"][i].keys()) for i in range(cfg.n_layer)]
        print("retomado de", args.resume)

    # validação: 2% do final do corpus
    val_start = int(tokens.size * 0.98)
    val_tokens = tokens[val_start:]
    tokens = tokens[:val_start]

    metrics = []
    t0 = time.time()
    ema = None

    for step in range(1, args.steps + 1):
        idx, tgt = sample_batch(tokens, cfg, args.batch, rng)
        params, opt_state, loss = train_step(params, opt_state, jnp.asarray(idx), jnp.asarray(tgt), cfg)
        lv = float(loss)
        ema = lv if ema is None else 0.9 * ema + 0.1 * lv

        if step % args.log_every == 0:
            dt = time.time() - t0
            tps = step * args.batch * cfg.ctx / dt
            print(f"passo {step:5d} | loss {ema:7.4f} | ppl {math.exp(min(ema,20)):8.2f} | {tps:6.0f} tok/s | {dt:6.1f}s", flush=True)

        if step % args.save_every == 0 or step == args.steps:
            path = os.path.join(args.out, "ckpt.npz")
            save_params(params, path, cfg)
            vidx, vtgt = sample_batch(val_tokens, cfg, 8, rng)
            vloss = float(eval_loss(params, jnp.asarray(vidx), jnp.asarray(vtgt), cfg))
            metrics.append({"step": step, "train": ema, "val": vloss, "time_s": time.time() - t0})
            json.dump(metrics, open(os.path.join(args.out, "metrics.json"), "w"), indent=2)
            print(f"  checkpoint salvo | val loss {vloss:.4f} | ppl {math.exp(min(vloss,20)):.1f}", flush=True)

            # amostra rápida para acompanhar
            try:
                from tokenizers import Tokenizer
                tok = Tokenizer.from_file(args.tokenizer)
                ids = tok.encode("<|endoftext|>\n<|user|> oi <|assistant|>").ids
                out = list(generate(params, tok, ids, cfg, n_new=40, temp=0.8, seed=1))
                print("  amostra:", repr(tok.decode(out)[:220]), flush=True)
            except Exception as exc:  # noqa: BLE001
                print("  (falha ao amostrar)", exc)

    print("fim")


if __name__ == "__main__":
    main()
