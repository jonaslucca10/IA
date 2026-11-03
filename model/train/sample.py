#!/usr/bin/env python3
"""
Gera amostras do modelo treinado para avaliar a qualidade.

Uso:
    python sample.py --ckpt checkpoints/ckpt.npz --tokenizer tokenizer.json
"""
import argparse
import json

import numpy as np
import jax.numpy as jnp
from tokenizers import Tokenizer

import train as T

PROMPTS = [
    "oi",
    "quem é você?",
    "o que você sabe fazer?",
    "tudo bem?",
    "obrigado",
    "me fale sobre a amizade",
    "explique o que é o tempo",
    "estou em dúvida",
    "até logo",
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ckpt", default="checkpoints/ckpt.npz")
    ap.add_argument("--tokenizer", default="tokenizer.json")
    ap.add_argument("--temp", type=float, default=0.8)
    ap.add_argument("--topk", type=int, default=40)
    ap.add_argument("--new", type=int, default=60)
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()

    cfgj = json.load(open(args.ckpt + ".config.json"))
    cfg = T.Config(**{k: cfgj[k] for k in ("vocab", "ctx", "d_model", "n_layer", "n_head", "d_ff")})

    data = np.load(args.ckpt)
    params = {
        "wte": jnp.asarray(data["wte"]),
        "wpe": jnp.asarray(data["wpe"]),
        "lnf_g": jnp.asarray(data["lnf_g"]),
        "lnf_b": jnp.asarray(data["lnf_b"]),
    }
    keys = ["ln1_g", "ln1_b", "wq", "bq", "wk", "bk", "wv", "bv", "wo", "bo",
            "ln2_g", "ln2_b", "w1", "b1", "w2", "b2"]
    params["layers"] = [{k: jnp.asarray(data[f"l{i}.{k}"]) for k in keys} for i in range(cfg.n_layer)]

    tok = Tokenizer.from_file(args.tokenizer)
    tok.add_special_tokens(["<|endoftext|>", "<|user|>", "<|assistant|>", "<|end|>"])

    for prompt in PROMPTS:
        text = f"<|endoftext|>\n<|user|> {prompt} <|assistant|> "
        ids = tok.encode(text).ids
        out = list(T.generate(params, tok, ids, cfg, n_new=args.new, temp=args.temp, seed=args.seed, top_k=args.topk))
        print(f"\n> {prompt}\n  {tok.decode(out).strip()}")


if __name__ == "__main__":
    main()
