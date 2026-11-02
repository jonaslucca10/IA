#!/usr/bin/env python3
"""
Exporta o checkpoint treinado para o formato que o navegador entende:

    own/config.json     configuração + manifesto dos tensores
    own/weights.bin     pesos em float16 (conversão feita aqui)
    own/tokenizer.json  vocabulário, merges e tokens especiais

Uso:
    python export.py --ckpt checkpoints/ckpt.npz --tokenizer tokenizer.json --out ../own
"""
import argparse
import json
import os

import numpy as np

SPECIAL_NAMES = ["<|endoftext|>", "<|user|>", "<|assistant|>", "<|end|>"]


def tensor_order(n_layer):
    order = ["wte", "wpe"]
    for i in range(n_layer):
        order += [
            f"l{i}.ln1_g", f"l{i}.ln1_b",
            f"l{i}.wq", f"l{i}.bq",
            f"l{i}.wk", f"l{i}.bk",
            f"l{i}.wv", f"l{i}.bv",
            f"l{i}.wo", f"l{i}.bo",
            f"l{i}.ln2_g", f"l{i}.ln2_b",
            f"l{i}.w1", f"l{i}.b1",
            f"l{i}.w2", f"l{i}.b2",
        ]
    order += ["lnf_g", "lnf_b"]
    return order


def export_tokenizer(path, out):
    data = json.load(open(path, encoding="utf-8"))
    model = data["model"]
    vocab = model["vocab"]
    merges = model["merges"]

    merge_list = []
    for m in merges:
        if isinstance(m, str):
            merge_list.append(m)
        else:
            merge_list.append(f"{m[0]} {m[1]}")

    out_data = {
        "vocabSize": len(vocab),
        "vocab": vocab,
        "merges": merge_list,
        "specials": {name: vocab[name] for name in SPECIAL_NAMES if name in vocab},
    }
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(out_data, fh, ensure_ascii=False, separators=(",", ":"))
    return out_data


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ckpt", default="checkpoints/ckpt.npz")
    ap.add_argument("--tokenizer", default="tokenizer.json")
    ap.add_argument("--out", default="../own")
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)

    npz = np.load(args.ckpt)
    cfg = json.load(open(args.ckpt + ".config.json", encoding="utf-8"))
    n_layer = cfg["n_layer"]

    order = tensor_order(n_layer)
    missing = [name for name in order if name not in npz]
    if missing:
        raise SystemExit(f"tensores faltando no checkpoint: {missing[:5]}")

    chunks = []
    manifest = []
    offset = 0
    total = 0

    for name in order:
        arr = np.asarray(npz[name], dtype=np.float32)
        flat = arr.reshape(-1)
        half = flat.astype(np.float16)
        raw = half.tobytes()
        manifest.append({
            "name": name,
            "shape": list(arr.shape),
            "offset": offset,
            "count": int(flat.size),
        })
        chunks.append(raw)
        offset += len(raw)
        total += flat.size

    with open(os.path.join(args.out, "weights.bin"), "wb") as fh:
        for raw in chunks:
            fh.write(raw)

    tok = export_tokenizer(args.tokenizer, os.path.join(args.out, "tokenizer.json"))

    config = {
        "name": "meu-modelo",
        "arch": "gpt",
        "vocab": cfg["vocab"],
        "ctx": cfg["ctx"],
        "d_model": cfg["d_model"],
        "n_layer": cfg["n_layer"],
        "n_head": cfg["n_head"],
        "d_ff": cfg["d_ff"],
        "params": int(total),
        "specials": tok["specials"],
        "tensors": manifest,
    }
    json.dump(config, open(os.path.join(args.out, "config.json"), "w", encoding="utf-8"), indent=2)

    size_mb = os.path.getsize(os.path.join(args.out, "weights.bin")) / (1024 * 1024)
    print(f"exportado: {total:,} parâmetros | {size_mb:.1f} MB (fp16)")
    print(f"layout: {args.out}/config.json, weights.bin, tokenizer.json")


if __name__ == "__main__":
    main()
