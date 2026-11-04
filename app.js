(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const ui = {
    form: $('#chatForm'),
    input: $('#messageInput'),
    micButton: $('#micButton'),
    messageList: $('#messageList'),
    characterCount: $('#characterCount'),
    assistantStatus: $('#assistantStatus'),
    stopSpeech: $('#stopSpeech'),
    clearChatButton: $('#clearChatButton'),
    newChatButton: $('#newChatButton'),
    memoryCount: $('#memoryCount'),
    memorySummary: $('#memorySummary'),
    knowledgeCount: $('#knowledgeCount'),
    notice: $('#notice'),
    noticeText: $('#noticeText'),
    dismissNotice: $('#dismissNotice'),
  };
  const keys = {
    memories: 'vozia.conversation-memories.v1',
    migrated: 'vozia.conversation-memories-migrated.v1',
    oldRules: 'vozia.local-rules.v1',
    oldKnowledge: 'vozia.local-knowledge.v1',
  };
  const welcomeText = 'Oi! Minha base local cobre vários assuntos. Você também pode me ensinar um fato ou preferência na conversa; vou guardar neste navegador.';
  const state = { memories: [], voices: [], recognition: null, listening: false, utterance: null, noticeTimer: null };

  function setStatus(text) {
    ui.assistantStatus.textContent = text;
  }

  function showNotice(text, duration = 6000) {
    window.clearTimeout(state.noticeTimer);
    ui.noticeText.textContent = text;
    ui.notice.hidden = false;
    if (duration > 0) state.noticeTimer = window.setTimeout(() => { ui.notice.hidden = true; }, duration);
  }

  function hideNotice() {
    window.clearTimeout(state.noticeTimer);
    ui.notice.hidden = true;
  }

  function updateCharacterCount() {
    ui.characterCount.textContent = `${ui.input.value.length} / 500`;
  }

  function updateDashboard() {
    const count = state.memories.length;
    if (ui.memoryCount) ui.memoryCount.textContent = `${count} ${count === 1 ? 'lembrança' : 'lembranças'}`;
    if (ui.memorySummary) {
      ui.memorySummary.textContent = count
        ? `Aprendendo com você: ${count} ${count === 1 ? 'informação guardada' : 'informações guardadas'} neste navegador.`
        : 'Aprendendo com você: ensine um fato ou preferência na conversa.';
    }
    if (ui.knowledgeCount) {
      const topicCount = window.JonisIAEngine.knowledgeCount || 0;
      ui.knowledgeCount.textContent = new Intl.NumberFormat('pt-BR').format(topicCount);
    }
  }

  function createId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return `memory-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function readList(key) {
    try {
      const value = JSON.parse(window.localStorage.getItem(key) || '[]');
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function saveMemories() {
    try {
      window.localStorage.setItem(keys.memories, JSON.stringify(state.memories));
      return true;
    } catch {
      return false;
    }
  }

  function migrateOldLearning() {
    const migrated = [];
    for (const rule of readList(keys.oldRules)) {
      if (!rule || !Array.isArray(rule.triggers) || typeof rule.response !== 'string') continue;
      const id = typeof rule.id === 'string' ? rule.id : createId();
      migrated.push({
        id,
        slot: `old-rule:${id}`,
        questions: rule.triggers.filter((trigger) => typeof trigger === 'string'),
        answer: rule.response,
        fact: `Resposta para ${rule.triggers.join(', ')}: ${rule.response}`,
      });
    }
    for (const entry of readList(keys.oldKnowledge)) {
      if (!entry || !Array.isArray(entry.questions) || typeof entry.answer !== 'string') continue;
      const id = typeof entry.id === 'string' ? entry.id : createId();
      migrated.push({
        id,
        slot: `old-knowledge:${id}`,
        questions: entry.questions.filter((question) => typeof question === 'string'),
        answer: entry.answer,
        fact: entry.questions[0] ? `${entry.questions[0]}: ${entry.answer}` : entry.answer,
      });
    }
    return migrated.filter((memory) => memory.questions.length > 0 && memory.answer.trim());
  }

  function loadMemories() {
    state.memories = readList(keys.memories).filter((memory) =>
      memory && typeof memory.id === 'string' && Array.isArray(memory.questions) && typeof memory.answer === 'string');
    try {
      if (window.localStorage.getItem(keys.migrated) === '1') return;
      if (state.memories.length === 0) state.memories = migrateOldLearning();
      const saved = state.memories.length === 0 || saveMemories();
      if (saved) {
        window.localStorage.removeItem(keys.oldRules);
        window.localStorage.removeItem(keys.oldKnowledge);
        window.localStorage.setItem(keys.migrated, '1');
      }
    } catch {
      // A memória ainda funciona durante esta sessão se o armazenamento estiver bloqueado.
    }
  }

  function remember(memory) {
    const normalize = window.JonisIAEngine.normalize;
    const questionKeys = new Set(memory.questions.map(normalize));
    let existingIndex = -1;
    if (memory.slot) existingIndex = state.memories.findIndex((item) => item.slot === memory.slot);
    if (existingIndex < 0) {
      existingIndex = state.memories.findIndex((item) => (item.questions || []).some((question) => questionKeys.has(normalize(question))));
    }
    const id = existingIndex >= 0 ? state.memories[existingIndex].id : createId();
    const next = { ...memory, id };
    if (existingIndex >= 0) state.memories[existingIndex] = next;
    else state.memories.push(next);
    const saved = saveMemories();
    updateDashboard();
    return saved;
  }

  function formatTime() {
    return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date());
  }

  function createAvatar() {
    const avatar = document.createElement('div');
    avatar.className = 'avatar avatar-message';
    avatar.setAttribute('aria-hidden', 'true');
    const wave = document.createElement('span');
    wave.className = 'avatar-wave';
    for (let index = 0; index < 5; index += 1) wave.append(document.createElement('i'));
    avatar.append(wave);
    return avatar;
  }

  function addMessage(role, text) {
    const article = document.createElement('article');
    article.className = `message ${role === 'user' ? 'message-user' : 'message-assistant'}`;
    if (role !== 'user') article.append(createAvatar());

    const content = document.createElement('div');
    content.className = 'message-content';
    const byline = document.createElement('div');
    byline.className = 'message-byline';
    const name = document.createElement('strong');
    name.textContent = role === 'user' ? 'Você' : 'Jonis.IA';
    const time = document.createElement('time');
    time.dateTime = new Date().toISOString();
    time.textContent = formatTime();
    byline.append(name, time);

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.textContent = text;
    content.append(byline, bubble);
    article.append(content);
    ui.messageList.append(article);
    ui.messageList.scrollTop = ui.messageList.scrollHeight;
    return article;
  }

  function loadVoices() {
    if ('speechSynthesis' in window) state.voices = window.speechSynthesis.getVoices();
  }

  function getVoice() {
    return state.voices.find((voice) => /^pt[-_]BR$/i.test(voice.lang))
      || state.voices.find((voice) => /^pt/i.test(voice.lang))
      || null;
  }

  function speak(text) {
    if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = getVoice();
    utterance.lang = voice?.lang || 'pt-BR';
    if (voice) utterance.voice = voice;
    utterance.rate = 0.96;
    utterance.pitch = 1;
    state.utterance = utterance;
    ui.stopSpeech.hidden = false;
    setStatus('Falando…');
    const finish = () => {
      if (state.utterance !== utterance) return;
      state.utterance = null;
      ui.stopSpeech.hidden = true;
      setStatus('Pronta para conversar');
    };
    utterance.onend = finish;
    utterance.onerror = finish;
    window.speechSynthesis.speak(utterance);
  }

  function stopSpeaking() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    state.utterance = null;
    ui.stopSpeech.hidden = true;
    setStatus('Pronta para conversar');
  }

  function applyMemoryAction(reply) {
    if (reply.action === 'learn') {
      const saved = remember(reply.memory);
      return saved ? reply.text : `${reply.text} Consigo lembrar durante esta sessão, mas não consegui salvar no navegador.`;
    }
    if (reply.action === 'forget-all' || reply.action === 'forget-some') {
      const ids = new Set(reply.memoryIds || []);
      state.memories = reply.action === 'forget-all' ? [] : state.memories.filter((memory) => !ids.has(memory.id));
      const saved = saveMemories();
      updateDashboard();
      return saved ? reply.text : `${reply.text} Não consegui salvar a alteração no navegador.`;
    }
    return reply.text;
  }

  function submitMessage(message) {
    const cleanMessage = message.trim();
    if (!cleanMessage) {
      ui.input.focus();
      return;
    }
    if (state.listening && state.recognition) state.recognition.stop();
    hideNotice();
    addMessage('user', cleanMessage);
    ui.input.value = '';
    updateCharacterCount();

    const reply = window.JonisIAEngine.getLocalReply(cleanMessage, state.memories);
    const answer = applyMemoryAction(reply);
    addMessage('assistant', answer);
    setStatus(reply.action === 'learn' ? 'Aprendi algo novo' : 'Pronta para conversar');
    speak(answer);
  }

  function resetConversation() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    state.utterance = null;
    ui.stopSpeech.hidden = true;
    if (state.listening && state.recognition) state.recognition.stop();
    hideNotice();
    ui.messageList.replaceChildren();
    addMessage('assistant', welcomeText);
    ui.input.value = '';
    updateCharacterCount();
    setStatus('Pronta para conversar');
    ui.input.focus();
  }

  function initSpeechRecognition() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      ui.micButton.title = 'Ditado por voz não é compatível com este navegador';
      ui.micButton.setAttribute('aria-label', 'Ditado por voz não disponível neste navegador');
      return;
    }
    const recognition = new Recognition();
    recognition.lang = 'pt-BR';
    recognition.continuous = false;
    recognition.interimResults = false;
    state.recognition = recognition;
    recognition.onstart = () => {
      state.listening = true;
      ui.micButton.classList.add('is-listening');
      ui.micButton.setAttribute('aria-label', 'Parar de ditar');
      ui.micButton.title = 'Parar de ditar';
      setStatus('Estou ouvindo…');
      hideNotice();
    };
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).map((result) => result[0]?.transcript || '').join(' ').trim();
      if (transcript) {
        ui.input.value = transcript.slice(0, 500);
        updateCharacterCount();
        ui.input.focus();
        showNotice('Texto reconhecido. Confira e toque em enviar.', 4500);
      }
    };
    recognition.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        showNotice('Permita o acesso ao microfone nas configurações do navegador.');
      } else if (event.error === 'no-speech') {
        showNotice('Não ouvi nada. Toque no microfone e tente falar de novo.');
      } else if (event.error !== 'aborted') {
        showNotice('O ditado não funcionou desta vez. Você ainda pode digitar.');
      }
    };
    recognition.onend = () => {
      state.listening = false;
      ui.micButton.classList.remove('is-listening');
      ui.micButton.setAttribute('aria-label', 'Ditar mensagem');
      ui.micButton.title = 'Ditar mensagem';
      if (!state.utterance) setStatus('Pronta para conversar');
    };
  }

  ui.form.addEventListener('submit', (event) => {
    event.preventDefault();
    submitMessage(ui.input.value);
  });
  ui.input.addEventListener('input', updateCharacterCount);
  ui.micButton.addEventListener('click', () => {
    if (!state.recognition) {
      showNotice('O ditado por voz não está disponível neste navegador. Você pode digitar normalmente.');
      return;
    }
    if (state.listening) {
      state.recognition.stop();
      return;
    }
    try {
      state.recognition.start();
    } catch {
      showNotice('Não foi possível iniciar o microfone. Aguarde um instante e tente novamente.');
    }
  });
  ui.stopSpeech.addEventListener('click', stopSpeaking);
  ui.clearChatButton.addEventListener('click', resetConversation);
  ui.newChatButton.addEventListener('click', resetConversation);
  document.querySelectorAll('[data-prompt]').forEach((button) => {
    button.addEventListener('click', () => submitMessage(button.dataset.prompt || ''));
  });
  ui.dismissNotice.addEventListener('click', hideNotice);
  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      resetConversation();
    }
  });

  loadMemories();
  initSpeechRecognition();
  if ('speechSynthesis' in window) {
    loadVoices();
    window.speechSynthesis.addEventListener?.('voiceschanged', loadVoices);
  }
  updateCharacterCount();
  updateDashboard();
})();
