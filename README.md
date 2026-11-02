# MinhaIA — você cria as regras

Um estúdio de agentes de IA em que **tudo é definido por você**: identidade, regras do que sempre fazer,
regras do que nunca fazer, tom, idioma, tamanho, formato, exemplos de resposta e o modelo que roda tudo isso.

**Sem chave de API.** Por padrão, o app usa um **modelo próprio**, treinado do zero neste repositório:
um GPT de 3,8 milhões de parâmetros em português que roda dentro do seu navegador. Sem cadastro,
sem servidor, sem download externo, sem custo por mensagem.

---

## Rodar

Não tem build, não tem dependência, não tem conta:

```bash
python3 -m http.server 5173
# abra http://localhost:5173
```

O modelo próprio (7,7 MB de pesos) já vem com o app e carrega em menos de um segundo.

> Sirva por `http://` (localhost serve). Abrir o `index.html` direto por `file://` bloqueia Web Workers,
> que é o que faz o modelo rodar.

---

## Como usar

1. **Crie o agente** — nome, emoji, ou comece por um dos 6 modelos prontos.
2. **Escreva a identidade** — quem ela é, qual o papel, qual o contexto.
3. **Defina as regras** — listas separadas de *sempre* e *nunca*. Arraste para reordenar.
4. **Ajuste o estilo** — tom, idioma, tamanho, formato e instruções extras.
5. **Dê exemplos** — um par pergunta/resposta vale mais que dez regras.
6. **Converse** — o modelo próprio já está ali, pronto.
7. *(Opcional)* **Troque o modelo** — outro modelo no navegador, Ollama local ou uma API, se quiser.

O botão **Prompt final** mostra exatamente o texto enviado como instrução de sistema. Nada é adicionado
nas suas costas.

---

## Quatro formas de rodar — sem API na primeira

### 0. Modelo próprio (padrão)

O cérebro do app é um GPT que treinamos aqui: ~3,8 milhões de parâmetros, tokenizer BPE de 8.192 tokens,
janela de 256, corpus de 11,5 MB em português (Machado de Assis, Bíblia e diálogos sintéticos).
Pesos em float16 (~7,7 MB) versionados no repo, inferência em JavaScript puro.

Detalhes, limitações e como reproduzir o treino: **[model/README.md](model/README.md)**.

Sendo honesto: 3,8M de parâmetros é muito pouco. Ele conversa em português, mas erra, repete e
inventa. É um modelo de verdade, nosso, não um produto pronto.

### 1. No navegador (modelo aberto, opcional)

O app baixa pesos ONNX do Hugging Face e executa via WebGPU (GPU) ou WASM (CPU), com Transformers.js
v4 dentro de um Web Worker. O modelo fica no cache do navegador.

Na primeira execução, o navegador busca duas coisas na internet: a biblioteca (CDN jsDelivr, com fallback
para unpkg) e os pesos do modelo (Hugging Face). Depois disso, o app funciona offline.

Escolha em **Modelo → No navegador**. O download é único e fica no cache.

| Modelo | Tamanho | Indicado para |
|---|---|---|
| Qwen2.5 0.5B *(padrão)* | ~400 MB | conversa rápida, respostas curtas |
| Llama 3.2 1B | ~700 MB | equilíbrio entre qualidade e velocidade |
| Qwen3 0.6B | ~500 MB | raciocínio (o "pensamento" é ocultado na interface) |
| Qwen3 1.7B | ~1,2 GB | melhor qualidade — precisa de máquina folgada |

Também aceita **qualquer modelo ONNX** compatível com Transformers.js, pelo campo "Outro modelo ONNX".

**Prós:** nenhuma chave, nenhum cadastro, nenhum custo, nada sai do dispositivo.
**Contras:** modelos pequenos seguem instruções pior que modelos grandes; o primeiro uso baixa centenas de MB.

### 2. Ollama (local, melhor qualidade)

```bash
ollama pull llama3.2
OLLAMA_ORIGINS='*' ollama serve
```

No app: **Modelo → Ollama**. Sem chave. Modelos de 7B–14B seguem suas regras muito melhor que os de 0,5B.

### 3. API (opcional, se você já tiver)

OpenAI, OpenRouter, Groq, Gemini, Mistral, DeepSeek ou qualquer endpoint compatível com `/chat/completions`.
Só é necessário se você quiser um modelo grande na nuvem. A chave fica salva apenas no seu navegador.

---

## "Sem restrições" — o que isso significa de verdade

A interface não adiciona filtro, censura ou camada de recusa. O system prompt é exatamente o que você
escreveu, e o botão **Prompt final** prova isso. Rodando no navegador ou no Ollama, ninguém no meio do
caminho vê ou limita a conversa.

O que nenhuma interface controla é o comportamento de um modelo de terceiro: se você conectar uma API
hospedada, o provedor ainda aplica as políticas dele. É justamente por isso que o padrão agora é local.

Este repositório não inclui jailbreaks nem instruções para burlar a segurança de provedores.

---

## Privacidade

- Sem servidor da MinhaIA: o navegador fala direto com o Hugging Face (download do modelo) ou com o
  provedor que você escolher.
- Agentes, regras e conversas ficam no `localStorage`.
- Chaves de API (se usadas) ficam no mesmo lugar e **nunca** entram no arquivo de exportação.
- No modo navegador, depois do download o app funciona offline.

## Se o provedor bloquear CORS

Use o proxy local incluso (zero dependências, escuta só em `127.0.0.1`, não guarda nada):

```bash
node proxy.mjs
# no campo Endpoint: http://127.0.0.1:8787/https://api.openai.com/v1
```

Não exponha esse proxy na internet.

---

## Estrutura

```
index.html      interface
styles.css      tema escuro, responsivo
app.js          estado, prompt, chat, streaming, motores
own-worker.js   worker do modelo próprio
model/engine.mjs  motor de inferência escrito à mão (tokenizer + GPT + amostragem)
model/own/      pesos treinados (config.json, weights.bin, tokenizer.json)
model/train/    pipeline de treino (corpus, tokenizer, JAX, exportação)
worker.js       modelo aberto no navegador (Transformers.js)
proxy.mjs       proxy local opcional (Node, sem dependências)
```

## Limitações conhecidas

- O modelo próprio é minúsculo (3,8M): frases curtas, nenhum conhecimento de mundo e pouca aderência
  a regras longas. Foi treinado para provar que dá para ter um modelo nosso — não para competir com
  um LLM de bilhões de parâmetros.
- Modelos no navegador também são pequenos: seguem regras simples bem, instruções longas e nuances, não.
  Para fidelidade às suas regras, use Ollama com 7B+.
- WebGPU depende do navegador (Chrome/Edge têm suporte amplo). Sem GPU, o app cai para CPU e fica mais lento.
- O primeiro carregamento de cada modelo baixa centenas de MB. Depois fica em cache até você limpar os dados do site.
- Chaves no `localStorage` são convenientes, não cofres. Para uso sério, sirva de uma origem só sua e
  prefira um modelo local.
- Limpar os dados do navegador apaga agentes e conversas — exporte backups.
