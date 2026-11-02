#!/usr/bin/env python3
"""
Treina o tokenizer BPE do modelo próprio (vocabulário de 8192 tokens).

Uso:
    python train_tokenizer.py --corpus corpus.txt --out tokenizer.json
"""
import argparse

from tokenizers import Tokenizer, models, pre_tokenizers, decoders, trainers, processors

SPECIAL_TOKENS = ["<|endoftext|>", "<|user|>", "<|assistant|>", "<|end|>"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--corpus", default="corpus.txt")
    ap.add_argument("--out", default="tokenizer.json")
    ap.add_argument("--vocab", type=int, default=8192)
    args = ap.parse_args()

    tok = Tokenizer(models.BPE(unk_token=None))
    tok.pre_tokenizer = pre_tokenizers.ByteLevel(add_prefix_space=False, use_regex=True)
    tok.decoder = decoders.ByteLevel()
    tok.post_processor = processors.ByteLevel(trim_offsets=False)

    trainer = trainers.BpeTrainer(
        vocab_size=args.vocab,
        special_tokens=SPECIAL_TOKENS,
        initial_alphabet=pre_tokenizers.ByteLevel.alphabet(),
        show_progress=True,
        min_frequency=2,
    )

    tok.train([args.corpus], trainer)
    tok.save(args.out)

    print(f"vocab real: {tok.get_vocab_size()}")
    for text in ["Olá, tudo bem?", "Sou um modelo pequeno, treinado do zero."]:
        enc = tok.encode(text)
        print(len(enc.ids), enc.tokens[:20])


if __name__ == "__main__":
    main()
