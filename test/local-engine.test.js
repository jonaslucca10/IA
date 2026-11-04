'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../local-engine.js');

const fixedDate = new Date('2026-03-14T15:09:00Z');

test('learns a personal fact from ordinary chat and recalls it later', () => {
  const teaching = engine.getLocalReply('Meu nome é Ana.', [], fixedDate);
  assert.equal(teaching.action, 'learn');
  assert.equal(teaching.memory.slot, 'user.name');
  const memory = { id: 'm1', ...teaching.memory };
  const answer = engine.getLocalReply('Qual é o meu nome?', [memory], fixedDate);
  assert.equal(answer.source, 'lembrança local');
  assert.equal(answer.text, 'Seu nome é Ana.');
});

test('learns a general fact after a natural prompt', () => {
  const teaching = engine.getLocalReply('Aprenda que a capital da França é Paris.', [], fixedDate);
  assert.equal(teaching.action, 'learn');
  const answer = engine.getLocalReply('Qual é a capital da França?', [{ id: 'm2', ...teaching.memory }], fixedDate);
  assert.equal(answer.source, 'lembrança local');
  assert.match(answer.text, /capital da França é Paris/i);
});

test('recalls a learned fact even when the new question wording was not stored', () => {
  const memory = {
    id: 'm-fact',
    questions: ['o que é contexto aleatório'],
    answer: 'Ana nasceu em Recife.',
    fact: 'Ana nasceu em Recife.',
  };
  const answer = engine.getLocalReply('Em que cidade Ana nasceu?', [memory], fixedDate);
  assert.equal(answer.source, 'lembrança local');
  assert.equal(answer.text, 'Ana nasceu em Recife.');
});

test('learns a conversational question-and-answer without a form', () => {
  const teaching = engine.getLocalReply('Quando eu perguntar quanto é 1+1, responda 2.', [], fixedDate);
  assert.equal(teaching.action, 'learn');
  const answer = engine.getLocalReply('quanto é 1+1?', [{ id: 'm3', ...teaching.memory }], fixedDate);
  assert.equal(answer.text, '2');
});

test('learns preferences and can forget a specific memory', () => {
  const teaching = engine.getLocalReply('Eu gosto de música.', [], fixedDate);
  const memory = { id: 'm4', ...teaching.memory };
  assert.match(engine.getLocalReply('Do que eu gosto?', [memory], fixedDate).text, /gosta de música/);
  const forgetting = engine.getLocalReply('Esqueça do que eu gosto.', [memory], fixedDate);
  assert.equal(forgetting.action, 'forget-some');
  assert.deepEqual(forgetting.memoryIds, ['m4']);
});

test('supports asking what it learned and clearing all memories', () => {
  const memories = [{ id: 'm5', fact: 'Meu nome é Ana.', answer: 'Seu nome é Ana.', questions: ['qual é meu nome'] }];
  assert.match(engine.getLocalReply('O que você aprendeu?', memories, fixedDate).text, /Meu nome é Ana/);
  assert.equal(engine.getLocalReply('Esqueça tudo.', memories, fixedDate).action, 'forget-all');
});

test('reports the verified size of its local knowledge base', () => {
  assert.equal(engine.knowledgeCount, 1323);
  assert.equal(engine.questionVariantCount, 3961);
});

test('answers common questions from its expanded local knowledge base', () => {
  assert.ok(engine.knowledgeCount >= 1300);

  const ai = engine.getLocalReply('O que é inteligência artificial?', [], fixedDate);
  assert.equal(ai.source, 'conhecimento local');
  assert.match(ai.text, /não significa que o sistema tenha consciência/i);

  const geography = engine.getLocalReply('Qual é a capital do Brasil?', [], fixedDate);
  assert.equal(geography.source, 'conhecimento local');
  assert.match(geography.text, /Brasília/);

  const technology = engine.getLocalReply('Qual a diferença entre HTTP e HTTPS?', [], fixedDate);
  assert.equal(technology.source, 'conhecimento local');
  assert.match(technology.text, /criptografia TLS/i);

  const math = engine.getLocalReply('O que diz o teorema de Pitágoras?', [], fixedDate);
  assert.equal(math.source, 'conhecimento local');
  assert.match(math.text, /a² \+ b² = c²/);

  const languageModel = engine.getLocalReply('O que é LLM?', [], fixedDate);
  assert.equal(languageModel.source, 'conhecimento local');
  assert.match(languageModel.text, /Modelo de linguagem grande/i);

  const ecology = engine.getLocalReply('O que é mutualismo?', [], fixedDate);
  assert.equal(ecology.source, 'conhecimento local');
  assert.match(ecology.text, /espécies diferentes/i);

  const physics = engine.getLocalReply('O que é o efeito Doppler?', [], fixedDate);
  assert.equal(physics.source, 'conhecimento local');
  assert.match(physics.text, /frequência/i);

  const computing = engine.getLocalReply('Qual a diferença entre CPU e GPU?', [], fixedDate);
  assert.equal(computing.source, 'conhecimento local');
  assert.match(computing.text, /paralelo/i);

  const history = engine.getLocalReply('O que foi a Revolução Haitiana?', [], fixedDate);
  assert.equal(history.source, 'conhecimento local');
  assert.match(history.text, /independência em 1804/i);

  const geographyExtra = engine.getLocalReply('Onde fica a Grande Barreira de Corais?', [], fixedDate);
  assert.equal(geographyExtra.source, 'conhecimento local');
  assert.match(geographyExtra.text, /Austrália/i);

  const astronomy = engine.getLocalReply('O que são ondas gravitacionais?', [], fixedDate);
  assert.equal(astronomy.source, 'conhecimento local');
  assert.match(astronomy.text, /espaço-tempo/i);

  const publicHealth = engine.getLocalReply('O que é epidemiologia?', [], fixedDate);
  assert.equal(publicHealth.source, 'conhecimento local');
  assert.match(publicHealth.text, /populações/i);

  const immunology = engine.getLocalReply('O que é o sistema complemento?', [], fixedDate);
  assert.equal(immunology.source, 'conhecimento local');
  assert.match(immunology.text, /proteínas/i);

  const statistics = engine.getLocalReply('O que afirma o teorema central do limite?', [], fixedDate);
  assert.equal(statistics.source, 'conhecimento local');
  assert.match(statistics.text, /distribuição normal/i);

  const networking = engine.getLocalReply('O que é DHCP?', [], fixedDate);
  assert.equal(networking.source, 'conhecimento local');
  assert.match(networking.text, /endereços IP/i);

  const art = engine.getLocalReply('O que é um afresco?', [], fixedDate);
  assert.equal(art.source, 'conhecimento local');
  assert.match(art.text, /reboco ainda úmido/i);

  const philosophy = engine.getLocalReply('O que estuda a epistemologia?', [], fixedDate);
  assert.equal(philosophy.source, 'conhecimento local');
  assert.match(philosophy.text, /conhecimento/i);

  const language = engine.getLocalReply('O que é um fonema?', [], fixedDate);
  assert.equal(language.source, 'conhecimento local');
  assert.match(language.text, /distinguir palavras/i);

  const film = engine.getLocalReply('O que é foley no cinema?', [], fixedDate);
  assert.equal(film.source, 'conhecimento local');
  assert.match(film.text, /sons cotidianos/i);

  const chemistry = engine.getLocalReply('Como funciona uma célula galvânica?', [], fixedDate);
  assert.equal(chemistry.source, 'conhecimento local');
  assert.match(chemistry.text, /reação espontânea/i);

  const atmosphere = engine.getLocalReply('O que é um rio atmosférico?', [], fixedDate);
  assert.equal(atmosphere.source, 'conhecimento local');
  assert.match(atmosphere.text, /transporta umidade/i);

  const epidemiology = engine.getLocalReply('Qual a diferença entre incidência e prevalência?', [], fixedDate);
  assert.equal(epidemiology.source, 'conhecimento local');
  assert.match(epidemiology.text, /novos casos/i);

  const algorithms = engine.getLocalReply('O que é um grafo acíclico dirigido?', [], fixedDate);
  assert.equal(algorithms.source, 'conhecimento local');
  assert.match(algorithms.text, /não contém ciclos dirigidos/i);

  const historyExtra = engine.getLocalReply('Quem foi Mansa Musa?', [], fixedDate);
  assert.equal(historyExtra.source, 'conhecimento local');
  assert.match(historyExtra.text, /Império do Mali/i);

  assert.equal(engine.getLocalReply('Capital?', [], fixedDate).source, 'ainda aprendendo');
});

test('calculates expressions, word operators, powers, percentages, and square roots', () => {
  assert.match(engine.getLocalReply('quanto é 1+1?', [], fixedDate).text, /2/);
  assert.match(engine.getLocalReply('Quanto é (2 + 3) × 4?', [], fixedDate).text, /20/);
  assert.match(engine.getLocalReply('Quanto é 7 vezes 6?', [], fixedDate).text, /42/);
  assert.match(engine.getLocalReply('Calcule 2^3.', [], fixedDate).text, /8/);
  assert.match(engine.getLocalReply('Quanto é 25 por cento de 200?', [], fixedDate).text, /50/);
  assert.match(engine.getLocalReply('raiz quadrada de 81', [], fixedDate).text, /9/);
  assert.match(engine.getLocalReply('1 dividido por 0', [], fixedDate).text, /Não posso dividir por zero/);
});

test('includes local greetings and date/time', () => {
  assert.equal(engine.getLocalReply('qual é o seu nome?', [], fixedDate).source, 'conversa');
  assert.match(engine.getLocalReply('que horas são?', [], fixedDate).text, /Agora são/);
});

test('admits when it has not learned an answer without misreading ordinary questions', () => {
  const answer = engine.getLocalReply('conte uma história sobre planetas', [], fixedDate);
  assert.equal(answer.source, 'ainda aprendendo');
  assert.match(answer.text, /Ainda não sei responder/i);

  const surfactant = engine.getLocalReply('Como sabão ajuda a remover gordura?', [], fixedDate);
  assert.equal(surfactant.source, 'conhecimento local');
  assert.match(surfactant.text, /tensoativo/i);
});
