# Jonis.IA — IA local que aprende conversando

Assistente web em português com memória local, ensino por conversa e respostas faladas pelo navegador. Não conecta à OpenAI, Gemini ou qualquer modelo externo.

## Executar

Requer Node.js 18 ou mais recente; não há dependências npm nem chave de API.

```bash
node server.js
```

Abra `http://localhost:4173`. Para gerar a versão estática de publicação em `dist/` ou executar os testes:

```bash
npm run build
node --test
```

## Ensinar pelo chat

A IA reconhece fatos e instruções em linguagem natural. Por exemplo:

- `Meu nome é Ana.`
- `Eu gosto de música.`
- `A capital da França é Paris.`
- `Quando eu perguntar quanto é 1+1, responda 2.`

Depois, pergunte sobre o que ensinou. Também é possível perguntar **“O que você aprendeu?”** e dizer **“Esqueça meu nome”** ou **“Esqueça tudo”** para apagar memórias.

A memória é salva no `localStorage` do navegador. O botão **Limpar conversa** limpa só o histórico visível; não apaga o que a IA aprendeu. O ditado opcional pode depender do serviço de voz do navegador.

## Como funciona e limitações

O motor local inclui 1.323 tópicos de conhecimento geral em ciências, tecnologia, matemática, natureza, geografia, história, filosofia, direito, economia, linguística, saúde, sociedade e artes; recupera memórias por semelhança lexical (TF-IDF); e trata cumprimentos, data, hora e cálculos com parênteses, operações, potências, porcentagens e raízes quadradas. A fala usa automaticamente a voz `pt-BR` disponível, sem seletor nem painel de configuração.

Esta primeira versão não é um LLM e não cria respostas abertas: ela responde com fatos que você ensinou e recursos locais. Quando não reconhece algo, admite que ainda não sabe para você poder ensiná-la na conversa.
