# IA por voz

Assistente de IA com **bate-papo por voz** em que **você define as regras**.
As regras que você escrever viram o *system prompt* de cada resposta, sem filtros
extras da aplicação.

- 🎙️ Fala → texto pelo microfone (Web Speech API do navegador, Chrome/Edge)
- 🔊 Texto → fala com a voz do navegador (ajustável em idioma e velocidade)
- 📜 Regras editáveis na tela (uma por linha) + nome do assistente, salvos no navegador
- ⌨️ Também aceita texto digitado

## Como rodar

Requer Node.js 18+ e uma chave de uma API compatível com OpenAI
(OpenAI, Groq, OpenRouter, Ollama com `/v1` etc.).

```bash
cp .env.example .env        # preencha LLM_API_KEY (e, se quiser, LLM_BASE_URL / LLM_MODEL)
export $(grep -v '^#' .env | xargs)
npm start                   # abre em http://localhost:3000
```

Depois abra a página no **Chrome** ou **Edge**, permita o microfone e toque no botão azul.

### Opção grátis: Ollama (modelo local, sem chave)

1. Instale o [Ollama](https://ollama.com) e baixe um modelo: `ollama pull llama3.2`
2. Rode a aplicação apontando para ele:

```bash
export LLM_BASE_URL=http://localhost:11434/v1
export LLM_MODEL=llama3.2
npm start
```

Com endereço local, `LLM_API_KEY` não é obrigatória.

## Estrutura

| Arquivo | Função |
| --- | --- |
| `server.js` | Servidor HTTP sem dependências: serve a página e `POST /api/chat`, montando o system prompt a partir das regras |
| `public/index.html` | Interface |
| `public/app.js` | Microfone, síntese de voz, histórico e configurações |
| `public/style.css` | Estilo |
| `test/server.test.js` | Testes (`npm test`) |

## Observações

- A chave da IA fica só no servidor (variável de ambiente); nunca é enviada ao navegador.
- O histórico fica na memória da aba e é enviado ao servidor a cada mensagem, limitado às últimas 40 (o servidor não guarda conversas).
- As regras são suas, mas o provedor de IA escolhido continua sujeito aos próprios termos de uso.
- Reconhecimento de voz depende do navegador; Firefox e Safari têm suporte limitado.
