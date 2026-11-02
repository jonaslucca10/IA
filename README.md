# MinhaIA — você cria as regras

Um estúdio de agentes de IA em que **tudo é definido por você**: identidade, regras do que sempre fazer,
regras do que nunca fazer, tom, idioma, tamanho, formato, exemplos de resposta e — no fim — o modelo que
vai rodar tudo isso.

Sem backend, sem conta, sem cadastro. É um app estático: seus agentes, conversas e chaves ficam no seu
navegador (ou na sua máquina, se você usar um modelo local).

---

## Rodar

Não tem build, não tem dependência. É só servir a pasta:

```bash
python3 -m http.server 5173
# abra http://localhost:5173
```

Ou abra o `index.html` direto no navegador. Para usar modelos locais, prefira servir por
`http://localhost` (alguns navegadores bloqueiam chamadas a `localhost` quando a página é `file://`).

---

## Como usar

1. **Crie o agente** — dê um nome e um emoji, ou comece por um dos 6 modelos prontos (assistente,
   professor, copywriter, dev, analista, espelho crítico).
2. **Escreva a identidade** — quem ela é, qual o papel, qual o contexto.
3. **Defina as regras** — listas separadas de *sempre* e *nunca*. Arraste para reordenar.
4. **Ajuste o estilo** — tom, idioma, tamanho, formato e instruções extras.
5. **Dê exemplos** — um par pergunta/resposta vale mais que dez regras: o modelo imita o padrão.
6. **Conecte um modelo** — provedor, endpoint, modelo e chave (ou um modelo local, sem chave).
7. **Converse** — streaming, parar no meio, regerar, copiar.

O botão **Prompt final** mostra exatamente o texto que o app envia como instrução de sistema. Nada é
adicionado nas suas costas.

---

## Provedores

| Provedor | Endpoint | Precisa de chave |
|---|---|---|
| OpenAI | `https://api.openai.com/v1` | sim |
| OpenRouter (dezenas de modelos) | `https://openrouter.ai/api/v1` | sim |
| Groq | `https://api.groq.com/openai/v1` | sim |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai` | sim |
| Mistral | `https://api.mistral.ai/v1` | sim |
| DeepSeek | `https://api.deepseek.com/v1` | sim |
| Ollama (local) | `http://localhost:11434/v1` | não |
| LM Studio (local) | `http://localhost:1234/v1` | não |
| Outro compatível com OpenAI | você define | depende |

Todos usam o mesmo formato `/chat/completions`, com streaming.

### Modelo local (controle máximo)

**Ollama:**

```bash
ollama pull llama3.2
OLLAMA_ORIGINS='*' ollama serve     # libera CORS para o navegador
```

**LM Studio:** carregue um modelo, ative o servidor local na porta `1234` e libere CORS nas configurações.

Rodando local, o prompt, o histórico e as respostas **não passam por nenhum servidor de terceiros**.

---

## "Sem restrições" — o que isso significa de verdade

Este projeto te dá controle total sobre o que **a interface** faz:

- você escreve 100% do system prompt — não existe filtro, censura ou camada de recusa adicionada pelo app;
- você escolhe o modelo, inclusive modelos locais que rodam na sua máquina;
- você pode exportar, editar e reimportar tudo;
- o botão **Prompt final** prova que o texto enviado é exatamente o que você montou.

O que **nenhuma interface consegue garantir** é o comportamento de um modelo de terceiro. Se você conectar
GPT, Claude, Gemini ou qualquer API hospedada, o provedor ainda aplica as próprias políticas e filtros de
segurança — e isso acontece do lado dele, fora do alcance deste app. É por isso que existe a opção local:
com um modelo aberto rodando na sua máquina, você é o único no caminho.

Este repositório não inclui jailbreaks nem instruções para burlar a segurança de provedores de terceiros.

---

## Privacidade

- Não existe servidor da MinhaIA: o navegador fala direto com o provedor que você escolher.
- Agentes, regras e conversas ficam no `localStorage` do navegador.
- As chaves de API ficam no mesmo lugar e **nunca** entram no arquivo de exportação.
- Em computador compartilhado, prefira não salvar a chave. "Apagar tudo" limpa agentes, conversas e chaves.

## Se o provedor bloquear CORS

Alguns provedores recusam chamadas feitas direto do navegador. Nesse caso, use o proxy local incluído
(zero dependências, escuta só em `127.0.0.1`, não guarda nada):

```bash
node proxy.mjs
# no campo Endpoint, use:
# http://127.0.0.1:8787/https://api.openai.com/v1
```

Ele repassa a requisição — inclusive o streaming — e responde ao navegador com os cabeçalhos de CORS.
Não exponha esse proxy na internet.

---

## Estrutura

```
index.html   interface
styles.css   tema escuro, responsivo
app.js       estado, prompt, chat, streaming, import/export
proxy.mjs    proxy local opcional (Node, sem dependências)
```

## Limitações conhecidas

- Chaves no `localStorage` são convenientes, não cofres: qualquer script no mesmo domínio poderia lê-las.
  Para uso sério, sirva de uma origem só sua.
- CORS é decisão do provedor; o proxy local resolve, mas é uma ponte local, não um servidor de produção.
- O app não guarda histórico no servidor, então limpar os dados do navegador apaga tudo — exporte backups.
