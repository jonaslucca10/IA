# IA por voz

Assistente de **bate-papo por voz** feito do zero, sem nenhum serviço de IA externo
e sem chave de API. Ele funciona em duas camadas:

1. **Regras:** você cadastra gatilhos e respostas. Se a sua fala contém um gatilho,
   o assistente responde com uma das respostas cadastradas.
2. **Modelo próprio:** se nenhuma regra casa, um modelo de palavras (n-gramas) treinado
   com o texto de `lib/corpus.js` gera uma resposta.

O modelo próprio é simples: com pouco texto, as frases são curtas e repetitivas. Para
melhorar, acrescente frases no seu estilo em `lib/corpus.js` (quanto mais, melhor).

- 🎙️ Fala → texto pelo microfone (Web Speech API do navegador, Chrome ou Edge)
- 🔊 Texto → fala com a voz do navegador (idioma e velocidade ajustáveis)
- 📜 Regras editáveis na tela, salvas no navegador
- ⌨️ Também aceita texto digitado

## Como rodar

Requer Node.js 18+ e nenhuma dependência extra.

```bash
npm start        # abre em http://localhost:3000
npm test         # roda os testes
```

## Ensinar o assistente

Você ensina conversando, por voz ou digitando:

```
aprenda: quando eu disser oi, responda Olá, tudo bem!
quando eu disser abacaxi responda Que fruta gostosa!
esqueça oi
```

- Ensinar um gatilho que já existe substitui a resposta antiga.
- O que você ensina é gravado no navegador (em `localStorage`), não no servidor.
  Por isso, outro navegador ou outro computador começa sem essas regras.

## Formato das regras

Uma regra por linha: gatilhos separados por vírgula, `=>`, respostas separadas por `|`.

```
oi, olá, bom dia => Olá! Como posso ajudar?|Oi! Tudo bem por aí?
quem é você => Eu sou o {nome}, um assistente que conversa por voz.
```

- Acentos, maiúsculas e pontuação são ignorados.
- Um gatilho casa palavra inteira (`oi` não casa com `oidores`).
- Se mais de um gatilho casa, vence o mais longo.
- `{nome}` vira o nome do assistente. Linhas que começam com `#` são comentários.

## Publicação na Vercel

O projeto já tem `api/chat.js` (função) e `vercel.json` (saída em `public/`). Basta
importar o repositório na Vercel: não há variáveis de ambiente para configurar.

## Estrutura

| Arquivo | Função |
| --- | --- |
| `lib/rules.js` | Interpreta as regras e encontra a resposta cadastrada |
| `lib/ngram.js` | Modelo próprio: treina e gera frases |
| `lib/corpus.js` | Texto de treino do modelo |
| `lib/core.js` | Decide entre regra e modelo para cada mensagem |
| `server.js` | Servidor local (`npm start`) |
| `api/chat.js` | Mesma lógica como função da Vercel |
| `public/` | Interface (HTML, CSS e JavaScript do navegador) |
| `test/` | Testes automatizados |
