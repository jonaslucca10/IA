# Jonis.IA — conversa local, no seu espaço

Jonis.IA é uma assistente web em português que funciona no navegador, aprende fatos e preferências pela conversa e guarda o histórico neste dispositivo. Não chama a OpenAI, Gemini, nem qualquer modelo ou API externa.

## Começar

Requer Node.js 18 ou mais recente. O projeto não tem dependências npm.

```bash
node server.js
```

Acesse `http://localhost:4173`. Também é possível gerar os arquivos estáticos da publicação em `dist/`:

```bash
npm run build
```

## Testes

```bash
npm test
```

## O que ela faz

- Conversa com uma base local de **1.323 tópicos** e **3.961 formas de perguntar**.
- Aprende informações e preferências quando você fala naturalmente, sem formulários — por exemplo, “Eu gosto de música” ou “Quando eu perguntar X, responda Y”.
- Guarda até 15 conversas recentes e as memórias no armazenamento local do navegador. Você pode rever/apagar lembranças e baixar uma cópia delas.
- Faz cálculos com operações, parênteses, potências, porcentagens e raízes quadradas.
- Lê respostas em voz alta usando a voz em português disponível no navegador. O ditado é opcional e depende do suporte/permissão do navegador.
- Pode ser instalada como aplicativo e mantém os arquivos da interface disponíveis offline depois da primeira abertura bem-sucedida.

## Privacidade e limites

As conversas e memórias ficam no `localStorage` do navegador e não sincronizam entre dispositivos. Se você limpar os dados do site ou trocar de navegador, poderá perdê-las; use **Baixar cópia** para guardar as memórias com segurança. O motor não é um LLM: ele responde usando fatos e padrões locais, não consulta a internet e pode não conhecer acontecimentos recentes. Quando não reconhece uma pergunta, deve dizer que ainda está aprendendo em vez de inventar uma resposta.
