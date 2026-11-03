#!/usr/bin/env python3
"""
Gera uma referência (ids + logits) do modelo em JAX para comparar com o
motor JavaScript. Se os dois baterem, a inferência do navegador está certa.

Uso:
    python validate_ref.py --ckpt checkpoints/ckpt.npz --tokenizer tokenizer.json --out /tmp/ref.json
"""
import argparse
import json

import numpy as np
import jax.numpy as jnp

import train as T

TEXT = "<|user|> oi, quem é você? <|assistant|>"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ckpt", default="checkpoints/ckpt.npz")
    ap.add_argument("--tokenizer", default="tokenizer.json")
    ap.add_argument("--out", default="/tmp/ref.json")
    args = ap.parse_args()

    cfg_json = json.load(open(args.ckpt + ".config.json"))
    cfg = T.Config(**{k: cfg_json[k] for k in ("vocab", "ctx", "d_model", "n_layer", "n_head", "d_ff")})

    data = np.load(args.ckpt)
    params = {
        "wte": jnp.asarray(data["wte"]),
        "wpe": jnp.asarray(data["wpe"]),
        "lnf_g": jnp.asarray(data["lnf_g"]),
        "lnf_b": jnp.asarray(data["lnf_b"]),
    }
    keys = ["ln1_g", "ln1_b", "wq", "bq", "wk", "bk", "wv", "bv", "wo", "bo",
            "ln2_g", "ln2_b", "w1", "b1", "w2", "b2"]
    params["layers"] = [
        {k: jnp.asarray(data[f"l{i}.{k}"]) for k in keys} for i in range(cfg.n_layer)
    ]

    from tokenizers import Tokenizer
    tok = Tokenizer.from_file(args.tokenizer)
    tok.add_special_tokens(["<|endoftext|>", "<|user|>", "<|assistant|>", "<|end|>"])

    ids = tok.encode(TEXT).ids
    ids = ids[: cfg.ctx]

    logits = np.asarray(T.forward(params, jnp.array([ids]), cfg))[0, -1, :].astype(np.float64)

    json.dump({
        "text": TEXT,
        "config": cfg_json,
        "ids": ids,
        "logits": logits.tolist(),
        "top": np.argsort(-logits)[:10].tolist(),
    }, open(args.out, "w"))

    print(f"ids: {ids}")
    print(f"top10: {np.argsort(-logits)[:10].tolist()}")


if __name__ == "__main__":
    main()
