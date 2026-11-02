# O modelo próprio

Este é o modelo de linguagem que roda no app: um GPT pequeno, treinado do zero aqui
dentro, em português. Não é um modelo baixado, não é uma API, não é um wrapper.

- **Arquitetura:** transformer decoder-only (pré-norm, atenção causal multi-head, MLP GELU 4×,
  embeddings de token e posição, cabeça de saída amarrada ao embedding).
- **Parâmetros:** 3.846.720.
- **Vocabulário:** BPE byte-level com 8.192 tokens, treinado no próprio corpus.
- **Janela de contexto:** 256 tokens.
- **Pesos:** `own/weights.bin` em float16 (~7,7 MB).
- **Inferência:** `engine.mjs`, escrita à mão em JavaScript puro (sem ONNX, sem Transformers.js,
  sem WebGPU). A mesma implementação roda no navegador e no Node.

## Corpus

| Fonte | Tipo | Tamanho |
|---|---|---|
| Obras de Machado de Assis (domínio público) | literatura, português do século XIX | ~9,4 MB |
| Bíblia (tradução católica, domínio público) | prosa religiosa | incluído acima |
| Diálogos sintéticos gerados por `train/build_corpus.py` | conversa, saudações, apresentação | ~2,1 MB |

Total: **~11,5 MB de texto**, ~1,96 milhão de palavras, **3,13 milhões de tokens**.
2% do final ficou separado para validação.

Os diálogos sintéticos ensinam o formato de conversa (`<|user|>` / `<|assistant|>`) e uma
personalidade básica: apresentar-se, agradecer, oferecer ajuda, admitir limites.

## Treino

```
modelo     d_model=192, 5 camadas, 6 cabeças, d_ff=768, contexto=256
otimizador AdamW, lr 8e-4 com warmup + cosine, weight decay 0.1, grad clip 1.0
lote       16 sequências × 256 tokens = 4.096 tokens por passo
hardware   2 vCPUs, sem GPU (JAX CPU)
```

O treino completo leva cerca de 50 minutos nesta máquina. Os checkpoints e as métricas ficam em
`train/checkpoints/` (fora do Git); o snapshot usado nos pesos versionados está em
`own/train-metrics.json`.

Estado do checkpoint incluído nos pesos: **passo 1000**, loss de treino 4.374,
**loss de validação 1.468** (perplexidade 4.3).

Exemplo de resposta gerada por este checkpoint:

> **oi, quem é você?**
> Sou um modelo de linguagem pequeno, treinado do zero aqui mesmo, para conversar.

## Reprodutível

```bash
# 1. dados (veja train/build_corpus.py para as fontes)
python train/build_corpus.py --raw train/raw --out train/corpus.txt

# 2. tokenizer e tokens
python train/train_tokenizer.py  --corpus train/corpus.txt --out train/tokenizer.json
python train/make_tokens.py      --corpus train/corpus.txt --tokenizer train/tokenizer.json --out train/tokens.bin

# 3. treino
python train/train.py --tokens train/tokens.bin --tokenizer train/tokenizer.json \
    --out train/checkpoints --steps 2600 --batch 16 --ctx 256 \
    --d_model 192 --n_layer 5 --n_head 6 --lr 8e-4 --warmup 150

# 4. exportar para o navegador
python train/export.py --ckpt train/checkpoints/ckpt.npz --tokenizer train/tokenizer.json --out own
```

## Validação

O motor JavaScript é comparado com a referência do JAX:

```bash
python train/validate_ref.py --ckpt train/checkpoints/ckpt.npz --tokenizer train/tokenizer.json --out /tmp/ref.json
node   train/validate.mjs --own own --ref /tmp/ref.json
```

Resultado esperado: ids do tokenizer idênticos, top-10 de logits igual e diferença máxima na
ordem de `1e-4` (só o arredondamento do float16).

## Limites — sem enfeite

Um modelo de 3,8 milhões de parâmetros treinado em 11 MB de texto **não é um ChatGPT**:

- frases curtas, às vezes sem sentido completo;
- nenhum conhecimento de mundo (não sabe fatos, datas, notícias);
- não segue instruções longas nem regras complexas;
- repete estruturas do corpus (literatura do século XIX, formato de diálogo).

Ele é honesto no que faz: um modelo de linguagem de verdade, com pesos e código nossos,
rodando localmente. Para respostas úteis de verdade, use um modelo maior (Ollama) — o app
continua oferecendo essa opção.
