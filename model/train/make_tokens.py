#!/usr/bin/env python3
"""
Converte o corpus em um vetor de ids (uint16) para o treino.

Uso:
    python tokenize.py --corpus corpus.txt --tokenizer tokenizer.json --out tokens.bin
"""
import argparse
import json

import numpy as np
from tokenizers import Tokenizer

SPECIAL_TOKENS = ["<|endoftext|>", "<|user|>", "<|assistant|>", "<|end|>"]


def load_tokenizer(path: str) -> Tokenizer:
    tok = Tokenizer.from_file(path)
    tok.add_special_tokens(SPECIAL_TOKENS)
    return tok


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--corpus", default="corpus.txt")
    ap.add_argument("--tokenizer", default="tokenizer.json")
    ap.add_argument("--out", default="tokens.bin")
    args = ap.parse_args()

    tok = load_tokenizer(args.tokenizer)
    text = open(args.corpus, encoding="utf-8").read()

    ids = []
    chunk = 2_000_000
    for i in range(0, len(text), chunk):
        ids.extend(tok.encode(text[i:i + chunk]).ids)

    arr = np.array(ids, dtype=np.uint16)
    arr.tofile(args.out)

    specials = {name: tok.token_to_id(name) for name in SPECIAL_TOKENS}
    meta = {
        "tokens": int(arr.size),
        "vocab": tok.get_vocab_size(),
        "specials": specials,
        "sample": tok.encode("Olá, tudo bem? <|user|> oi <|assistant|> olá!").ids,
    }
    json.dump(meta, open(args.out + ".json", "w"), indent=2)
    print(json.dumps(meta, indent=2)[:600])


if __name__ == "__main__":
    main()
