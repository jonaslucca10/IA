# MinhaIA — você cria as regras

Um estúdio de agentes de IA em que **tudo é definido por você**: identidade, regras do que sempre fazer,
regras do que nunca fazer, tom, idioma, tamanho, formato, exemplos de resposta e o modelo que roda tudo isso.

**Sem chave de API.** Por padrão, o modelo é baixado uma vez e passa a rodar **dentro do seu navegador**.
Sem cadastro, sem servidor, sem custo por mensagem.

---

## Rodar

Não tem build, não tem dependência, não tem conta:

```bash
python3 -m http.server 5173
# abra http://localhost:5173
```

A primeira mensagem baixa o modelo (~400 MB no padrão) e o guarda no cache do navegador. Depois disso,
funciona offline.

> Sirva por `http://` (localhost serve). Abrir o `index.html` direto por `file://` bloqueia Web Workers,
> que é o que faz o modelo rodar.

---

## Como usar

1. **Crie o agente** — nome, emoji, ou comece por um dos 6 modelos prontos.
2. **Escreva a identidade** — quem ela é, qual o papel, qual o contexto.
3. **Defina as regras** — listas separadas de *sempre* e *nunca*. Arraste para reordenar.
4. **Ajuste o estilo** — tom, idioma, tamanho, formato e instruções extras.
5. **Dê exemplos** — um par pergunta/resposta vale mais que dez regras.
6. **Converse** — a primeira resposta baixa o modelo; as próximas rodam no seu dispositivo.
7. *(Opcional)* **Troque o modelo** — outro modelo no navegador, Ollama local ou uma API, se quiser.

O botão **Prompt final** mostra exatamente o texto enviado como instrução de sistema. Nada é adicionado
nas suas costas.

---

## Três formas de rodar — sem API na primeira

### 1. No navegador (padrão, sem chave)

O app baixa pesos ONNX do Hugging Face e executa via WebGPU (GPU) ou WASM (CPU), com Transformers.js
v4 dentro de um Web Worker. O modelo fica no cache do navegador.

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
index.html   interface
styles.css   tema escuro, responsivo
app.js       estado, prompt, chat, streaming, motor local
worker.js    inferência no navegador (Transformers.js + ONNX Runtime Web)
proxy.mjs    proxy local opcional (Node, sem dependências)
```

## Limitações conhecidas

- Modelos no navegador são pequenos: seguem regras simples bem, instruções longas e nuances, não.
  Para fidelidade às suas regras, use Ollama com 7B+.
- WebGPU depende do navegador (Chrome/Edge têm suporte amplo). Sem GPU, o app cai para CPU e fica mais lento.
- O primeiro carregamento de cada modelo baixa centenas de MB. Depois fica em cache até você limpar os dados do site.
- Chaves no `localStorage` são convenientes, não cofres. Para uso sério, sirva de uma origem só sua e
  prefira um modelo local.
- Limpar os dados do navegador apaga agentes e conversas — exporte backups.
