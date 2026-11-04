(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const ui = {
    body: document.body,
    sidebar: $('#sidebar'),
    sidebarScrim: $('#sidebarScrim'),
    mobileMenuButton: $('#mobileMenuButton'),
    closeSidebarButton: $('#closeSidebarButton'),
    form: $('#chatForm'),
    input: $('#messageInput'),
    sendButton: $('#sendButton'),
    micButton: $('#micButton'),
    messageList: $('#messageList'),
    viewport: $('#conversationViewport'),
    characterCount: $('#characterCount'),
    assistantStatus: $('#assistantStatus'),
    currentSessionTitle: $('#currentSessionTitle'),
    stopSpeech: $('#stopSpeech'),
    newChatButton: $('#newChatButton'),
    newChatTopButton: $('#newChatTopButton'),
    conversationList: $('#conversationList'),
    conversationCount: $('#conversationCount'),
    openMemoriesButton: $('#openMemoriesButton'),
    openMemoriesTopButton: $('#openMemoriesTopButton'),
    sidebarMemoryCount: $('#sidebarMemoryCount'),
    knowledgeCount: $('#knowledgeCount'),
    memoryDialog: $('#memoryDialog'),
    closeMemoryDialog: $('#closeMemoryDialog'),
    memoryList: $('#memoryList'),
    memoryCount: $('#memoryCount'),
    clearMemoriesButton: $('#clearMemoriesButton'),
    exportMemoriesButton: $('#exportMemoriesButton'),
    notice: $('#notice'),
    noticeText: $('#noticeText'),
    dismissNotice: $('#dismissNotice'),
    toast: $('#toast'),
    installButton: $('#installButton'),
  };
  const keys = {
    memories: 'vozia.conversation-memories.v1',
    migrated: 'vozia.conversation-memories-migrated.v1',
    oldRules: 'vozia.local-rules.v1',
    oldKnowledge: 'vozia.local-knowledge.v1',
    conversations: 'jonis.conversations.v1',
    activeConversation: 'jonis.active-conversation.v1',
  };
  const limits = { conversations: 15, messages: 60, messageLength: 5000, inputLength: 2000 };
  const statusReady = 'Pronta para conversar';
  const sourceLabels = {
    'conhecimento local': ['Base local', 'source-knowledge'],
    'memória local': ['Memória', 'source-memory'],
    'lembrança local': ['Memória', 'source-memory'],
    'recurso local': ['Recurso local', 'source-resource'],
    'aprendizado local': ['Aprendizado', 'source-learning'],
    conversa: ['Conversa', 'source-chat'],
    'ainda aprendendo': ['Ainda aprendendo', 'source-unknown'],
  };
  const state = {
    memories: [],
    conversations: [],
    activeConversationId: null,
    voices: [],
    recognition: null,
    listening: false,
    utterance: null,
    noticeTimer: null,
    toastTimer: null,
    installPrompt: null,
    storageAvailable: true,
    storageNoticeShown: false,
    previousFocus: null,
  };

  function createId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return `jonis-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function readStorage(key, fallback = null) {
    try {
      const value = window.localStorage.getItem(key);
      return value === null ? fallback : value;
    } catch {
      state.storageAvailable = false;
      return fallback;
    }
  }

  function readList(key) {
    try {
      const value = JSON.parse(readStorage(key, '[]') || '[]');
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function reportStorageProblem() {
    if (state.storageNoticeShown) return;
    state.storageNoticeShown = true;
    showNotice('O navegador bloqueou o armazenamento local. A conversa ainda funciona agora, mas não ficará salva depois que você sair.');
  }

  function writeStorage(key, value) {
    try {
      window.localStorage.setItem(key, value);
      state.storageAvailable = true;
      return true;
    } catch {
      state.storageAvailable = false;
      reportStorageProblem();
      return false;
    }
  }

  function showNotice(text, duration = 6500) {
    if (!ui.notice || !ui.noticeText) return;
    window.clearTimeout(state.noticeTimer);
    ui.noticeText.textContent = text;
    ui.notice.hidden = false;
    if (duration > 0) state.noticeTimer = window.setTimeout(hideNotice, duration);
  }

  function hideNotice() {
    window.clearTimeout(state.noticeTimer);
    if (ui.notice) ui.notice.hidden = true;
  }

  function showToast(text) {
    if (!ui.toast) return;
    window.clearTimeout(state.toastTimer);
    ui.toast.textContent = text;
    ui.toast.hidden = false;
    window.requestAnimationFrame(() => ui.toast.classList.add('is-visible'));
    state.toastTimer = window.setTimeout(() => {
      ui.toast.classList.remove('is-visible');
      window.setTimeout(() => { ui.toast.hidden = true; }, 200);
    }, 2400);
  }

  function setStatus(text) {
    if (ui.assistantStatus) ui.assistantStatus.textContent = text;
  }

  function formatTime(value = new Date()) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(date);
  }

  function formatConversationDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const now = new Date();
    if (date.toDateString() === now.toDateString()) return formatTime(date);
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return 'ontem';
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(date).replace('.', '');
  }

  function normalizeMessage(message) {
    if (!message || !['assistant', 'user'].includes(message.role) || typeof message.text !== 'string') return null;
    const now = new Date().toISOString();
    return {
      id: typeof message.id === 'string' ? message.id : createId(),
      role: message.role,
      text: message.text.slice(0, limits.messageLength),
      source: typeof message.source === 'string' ? message.source : '',
      createdAt: typeof message.createdAt === 'string' ? message.createdAt : now,
    };
  }

  function normalizeConversation(conversation) {
    if (!conversation || typeof conversation !== 'object') return null;
    const messages = Array.isArray(conversation.messages)
      ? conversation.messages.map(normalizeMessage).filter(Boolean).slice(-limits.messages)
      : [];
    const now = new Date().toISOString();
    return {
      id: typeof conversation.id === 'string' ? conversation.id : createId(),
      title: typeof conversation.title === 'string' ? conversation.title.slice(0, 60) : 'Nova conversa',
      createdAt: typeof conversation.createdAt === 'string' ? conversation.createdAt : now,
      updatedAt: typeof conversation.updatedAt === 'string' ? conversation.updatedAt : now,
      messages,
    };
  }

  function activeConversation() {
    return state.conversations.find((conversation) => conversation.id === state.activeConversationId) || null;
  }

  function sortAndLimitConversations() {
    state.conversations.sort((first, second) => Date.parse(second.updatedAt) - Date.parse(first.updatedAt));
    state.conversations = state.conversations.slice(0, limits.conversations);
    if (!state.conversations.some((conversation) => conversation.id === state.activeConversationId)) {
      state.activeConversationId = state.conversations[0]?.id || null;
    }
  }

  function saveConversations() {
    sortAndLimitConversations();
    const savedList = writeStorage(keys.conversations, JSON.stringify(state.conversations));
    const savedActive = writeStorage(keys.activeConversation, state.activeConversationId || '');
    return savedList && savedActive;
  }

  function loadConversations() {
    state.conversations = readList(keys.conversations).map(normalizeConversation).filter(Boolean);
    const requestedId = readStorage(keys.activeConversation, '');
    state.activeConversationId = state.conversations.some((conversation) => conversation.id === requestedId)
      ? requestedId
      : state.conversations[0]?.id || null;
    if (!state.conversations.length) {
      const conversation = createConversationRecord();
      state.conversations = [conversation];
      state.activeConversationId = conversation.id;
      saveConversations();
    }
    sortAndLimitConversations();
  }

  function createConversationRecord() {
    const now = new Date().toISOString();
    return { id: createId(), title: 'Nova conversa', createdAt: now, updatedAt: now, messages: [] };
  }

  function startConversation() {
    const current = activeConversation();
    if (current && current.messages.length === 0) {
      ui.input.focus();
      closeSidebar();
      return;
    }
    stopSpeaking();
    const conversation = createConversationRecord();
    state.conversations.unshift(conversation);
    state.activeConversationId = conversation.id;
    saveConversations();
    renderConversation();
    closeSidebar();
    ui.input.focus();
  }

  function deleteConversation(id) {
    const conversation = state.conversations.find((item) => item.id === id);
    if (!conversation) return;
    const label = conversation.title || 'esta conversa';
    if (!window.confirm(`Apagar “${label}” deste navegador?`)) return;
    if (state.activeConversationId === id) stopSpeaking();
    state.conversations = state.conversations.filter((item) => item.id !== id);
    if (state.activeConversationId === id) state.activeConversationId = null;
    if (!state.conversations.length) state.conversations.push(createConversationRecord());
    if (!state.activeConversationId) state.activeConversationId = state.conversations[0].id;
    saveConversations();
    renderConversation();
    showToast('Conversa apagada.');
  }

  function openConversation(id) {
    if (!state.conversations.some((conversation) => conversation.id === id)) return;
    stopSpeaking();
    state.activeConversationId = id;
    saveConversations();
    renderConversation();
    closeSidebar();
  }

  function summarizeConversation(conversation) {
    const lastUserMessage = [...conversation.messages].reverse().find((message) => message.role === 'user');
    const lastMessage = conversation.messages[conversation.messages.length - 1];
    const preview = lastUserMessage?.text || lastMessage?.text || 'Comece uma conversa';
    return preview.replace(/\s+/g, ' ').slice(0, 54);
  }

  function renderConversationList() {
    if (!ui.conversationList) return;
    ui.conversationList.replaceChildren();
    if (ui.conversationCount) ui.conversationCount.textContent = String(state.conversations.length);
    if (!state.conversations.length) {
      const empty = document.createElement('p');
      empty.className = 'conversation-empty';
      empty.textContent = 'Suas conversas aparecerão aqui.';
      ui.conversationList.append(empty);
      return;
    }

    for (const conversation of state.conversations) {
      const item = document.createElement('div');
      item.className = `conversation-item${conversation.id === state.activeConversationId ? ' is-active' : ''}`;
      item.setAttribute('role', 'listitem');

      const open = document.createElement('button');
      open.className = 'conversation-open';
      open.type = 'button';
      open.setAttribute('aria-current', conversation.id === state.activeConversationId ? 'page' : 'false');
      open.title = conversation.title;
      open.addEventListener('click', () => openConversation(conversation.id));
      const title = document.createElement('strong');
      title.textContent = conversation.title || 'Nova conversa';
      const preview = document.createElement('small');
      preview.textContent = summarizeConversation(conversation);
      open.append(title, preview);

      const remove = document.createElement('button');
      remove.className = 'delete-conversation';
      remove.type = 'button';
      remove.setAttribute('aria-label', `Apagar conversa: ${conversation.title || 'Nova conversa'}`);
      remove.title = 'Apagar conversa';
      remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3" /></svg>';
      remove.addEventListener('click', () => deleteConversation(conversation.id));
      item.append(open, remove);
      ui.conversationList.append(item);
    }
  }

  function updateDashboard() {
    const count = state.memories.length;
    const countText = new Intl.NumberFormat('pt-BR').format(count);
    if (ui.memoryCount) ui.memoryCount.textContent = countText;
    if (ui.sidebarMemoryCount) ui.sidebarMemoryCount.textContent = countText;
    if (ui.knowledgeCount) {
      const topics = window.JonisIAEngine?.knowledgeCount || 0;
      const variants = window.JonisIAEngine?.questionVariantCount || 0;
      const formattedTopics = new Intl.NumberFormat('pt-BR').format(topics);
      const formattedVariants = new Intl.NumberFormat('pt-BR').format(variants);
      ui.knowledgeCount.textContent = formattedTopics;
      ui.knowledgeCount.title = `${formattedTopics} temas · ${formattedVariants} formas de perguntar`;
      $('#exploreLink').setAttribute('aria-label', `Explorar ${formattedTopics} assuntos e ${formattedVariants} formas de perguntar`);
    }
    const current = activeConversation();
    if (ui.currentSessionTitle) ui.currentSessionTitle.textContent = current?.title || 'Nova conversa';
    if (ui.openMemoriesTopButton) {
      ui.openMemoriesTopButton.setAttribute('aria-label', `Abrir minhas memórias (${count})`);
      ui.openMemoriesTopButton.title = `Minhas memórias (${count})`;
    }
  }

  function renderConversation() {
    const conversation = activeConversation();
    if (ui.messageList) {
      ui.messageList.replaceChildren();
      for (const message of conversation?.messages || []) ui.messageList.append(createMessageElement(message));
    }
    ui.body.classList.toggle('has-chat', Boolean(conversation?.messages.some((message) => message.role === 'user')));
    renderConversationList();
    updateDashboard();
    scrollToBottom(false);
  }

  function recordMessage(role, text, source = '') {
    const conversation = activeConversation();
    if (!conversation) return null;
    const message = {
      id: createId(),
      role,
      text: String(text).slice(0, limits.messageLength),
      source,
      createdAt: new Date().toISOString(),
    };
    conversation.messages.push(message);
    conversation.messages = conversation.messages.slice(-limits.messages);
    if (role === 'user' && conversation.title === 'Nova conversa') {
      const title = message.text.replace(/\s+/g, ' ').trim();
      conversation.title = title.length > 38 ? `${title.slice(0, 37).trimEnd()}…` : title || 'Nova conversa';
    }
    conversation.updatedAt = message.createdAt;
    saveConversations();
    renderConversation();
    return message;
  }

  function makeActionButton(label, title, iconMarkup, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-label', label);
    button.title = title;
    button.innerHTML = iconMarkup;
    button.addEventListener('click', onClick);
    return button;
  }

  function createMessageElement(message) {
    const article = document.createElement('article');
    article.className = `message message-${message.role}`;
    const avatar = document.createElement('span');
    avatar.className = 'message-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = message.role === 'user' ? 'Você' : 'J';

    const body = document.createElement('div');
    body.className = 'message-body';
    const meta = document.createElement('div');
    meta.className = 'message-meta';
    const author = document.createElement('strong');
    author.textContent = message.role === 'user' ? 'Você' : 'Jonis.IA';
    const time = document.createElement('time');
    time.dateTime = message.createdAt;
    time.textContent = formatTime(message.createdAt);
    meta.append(author, time);

    if (message.role === 'assistant' && message.source) {
      const [label, sourceClass] = sourceLabels[message.source] || [message.source, 'source-chat'];
      const source = document.createElement('span');
      source.className = `source-badge ${sourceClass}`;
      source.textContent = label;
      meta.append(source);
    }

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.textContent = message.text;
    body.append(meta, bubble);

    if (message.role === 'assistant') {
      const actions = document.createElement('div');
      actions.className = 'message-actions';
      const copy = makeActionButton('Copiar resposta', 'Copiar resposta', '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg><span>Copiar</span>', () => copyText(message.text));
      const speakAgain = makeActionButton('Ouvir resposta novamente', 'Ouvir resposta novamente', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4h4l5 4V6l-5 4H4Z"/><path d="M17 9a5 5 0 0 1 0 6m2.5-8.5a8.5 8.5 0 0 1 0 11"/></svg><span>Ouvir</span>', () => speak(message.text));
      actions.append(copy, speakAgain);
      body.append(actions);
    }

    article.append(avatar, body);
    return article;
  }

  function scrollToBottom(smooth = true) {
    if (!ui.viewport) return;
    window.requestAnimationFrame(() => {
      ui.viewport.scrollTo({ top: ui.viewport.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    });
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const fallback = document.createElement('textarea');
        fallback.value = text;
        fallback.setAttribute('readonly', '');
        fallback.style.position = 'fixed';
        fallback.style.opacity = '0';
        document.body.append(fallback);
        fallback.select();
        const copied = document.execCommand('copy');
        fallback.remove();
        if (!copied) throw new Error('copy unavailable');
      }
      showToast('Resposta copiada.');
    } catch {
      showNotice('Não consegui copiar automaticamente. Selecione o texto da resposta para copiá-lo.');
    }
  }

  function sanitizeMemory(memory) {
    return memory && typeof memory.id === 'string' && Array.isArray(memory.questions) && typeof memory.answer === 'string'
      ? memory
      : null;
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
    state.memories = readList(keys.memories).map(sanitizeMemory).filter(Boolean);
    try {
      if (readStorage(keys.migrated, '') === '1') return;
      if (state.memories.length === 0) state.memories = migrateOldLearning();
      const saved = state.memories.length === 0 || writeStorage(keys.memories, JSON.stringify(state.memories));
      if (saved) {
        window.localStorage.removeItem(keys.oldRules);
        window.localStorage.removeItem(keys.oldKnowledge);
        window.localStorage.setItem(keys.migrated, '1');
      }
    } catch {
      state.storageAvailable = false;
    }
  }

  function saveMemories() {
    return writeStorage(keys.memories, JSON.stringify(state.memories));
  }

  function remember(memory) {
    const normalize = window.JonisIAEngine.normalize;
    const questionKeys = new Set(memory.questions.map(normalize));
    let existingIndex = memory.slot ? state.memories.findIndex((item) => item.slot === memory.slot) : -1;
    if (existingIndex < 0) {
      existingIndex = state.memories.findIndex((item) => (item.questions || []).some((question) => questionKeys.has(normalize(question))));
    }
    const previous = existingIndex >= 0 ? state.memories[existingIndex] : null;
    const now = new Date().toISOString();
    const next = {
      ...memory,
      id: previous?.id || createId(),
      createdAt: previous?.createdAt || now,
      updatedAt: now,
    };
    if (existingIndex >= 0) state.memories[existingIndex] = next;
    else state.memories.push(next);
    const saved = saveMemories();
    updateDashboard();
    renderMemoryList();
    return saved;
  }

  function removeMemories(ids, all = false) {
    const idSet = new Set(ids || []);
    state.memories = all ? [] : state.memories.filter((memory) => !idSet.has(memory.id));
    const saved = saveMemories();
    updateDashboard();
    renderMemoryList();
    return saved;
  }

  function applyMemoryAction(reply) {
    if (reply.action === 'learn') {
      const saved = remember(reply.memory);
      if (!saved) return `${reply.text} Consigo lembrar durante esta sessão, mas não consegui salvar no navegador.`;
      showToast('Lembrança salva neste navegador.');
      return reply.text;
    }
    if (reply.action === 'forget-all' || reply.action === 'forget-some') {
      const saved = removeMemories(reply.memoryIds || [], reply.action === 'forget-all');
      if (!saved) return `${reply.text} Não consegui salvar a alteração no navegador.`;
      return reply.text;
    }
    return reply.text;
  }

  function renderMemoryList() {
    if (!ui.memoryList) return;
    ui.memoryList.replaceChildren();
    const count = state.memories.length;
    if (ui.memoryCount) ui.memoryCount.textContent = new Intl.NumberFormat('pt-BR').format(count);
    if (ui.clearMemoriesButton) ui.clearMemoriesButton.disabled = count === 0;
    if (ui.exportMemoriesButton) ui.exportMemoriesButton.disabled = count === 0;
    if (!count) {
      const empty = document.createElement('li');
      empty.className = 'memory-empty';
      empty.textContent = 'Ainda não guardei nenhuma lembrança. É só me contar algo naturalmente na conversa.';
      ui.memoryList.append(empty);
      return;
    }

    for (const memory of [...state.memories].reverse()) {
      const item = document.createElement('li');
      item.className = 'memory-item';
      const copy = document.createElement('span');
      copy.className = 'memory-item-copy';
      const fact = document.createElement('strong');
      fact.textContent = memory.fact || memory.answer || 'Lembrança sem descrição';
      const savedDate = memory.updatedAt || memory.createdAt;
      const detail = document.createElement('small');
      detail.textContent = savedDate ? `Atualizada ${formatConversationDate(savedDate)}` : 'Salva neste navegador';
      copy.append(fact, detail);
      const remove = document.createElement('button');
      remove.className = 'memory-delete';
      remove.type = 'button';
      remove.setAttribute('aria-label', `Apagar lembrança: ${fact.textContent}`);
      remove.title = 'Apagar esta lembrança';
      remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3" /></svg>';
      remove.addEventListener('click', () => {
        const saved = removeMemories([memory.id]);
        showToast(saved ? 'Lembrança apagada.' : 'A alteração não pôde ser salva neste navegador.');
      });
      item.append(copy, remove);
      ui.memoryList.append(item);
    }
  }

  function openMemoryDialog() {
    renderMemoryList();
    closeSidebar();
    state.previousFocus = document.activeElement;
    if (typeof ui.memoryDialog.showModal === 'function') ui.memoryDialog.showModal();
    else ui.memoryDialog.setAttribute('open', '');
    ui.closeMemoryDialog.focus();
  }

  function closeMemoryDialog() {
    if (typeof ui.memoryDialog.close === 'function' && ui.memoryDialog.open) ui.memoryDialog.close();
    else ui.memoryDialog.removeAttribute('open');
    if (state.previousFocus && typeof state.previousFocus.focus === 'function') state.previousFocus.focus();
  }

  function clearAllMemories() {
    if (!state.memories.length) return;
    if (!window.confirm('Apagar todas as lembranças que Jonis.IA guardou neste navegador?')) return;
    const saved = removeMemories([], true);
    showToast(saved ? 'Todas as lembranças foram apagadas.' : 'A alteração não pôde ser salva neste navegador.');
  }

  function exportMemories() {
    if (!state.memories.length) return;
    const payload = {
      app: 'Jonis.IA',
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      notice: 'Este arquivo pode conter informações pessoais que você ensinou à Jonis.IA.',
      memories: state.memories,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `jonis-ia-memorias-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('Cópia das memórias baixada. Guarde o arquivo com cuidado.');
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
    try {
      const utterance = new SpeechSynthesisUtterance(text);
      const voice = getVoice();
      utterance.lang = voice?.lang || 'pt-BR';
      if (voice) utterance.voice = voice;
      utterance.rate = 0.96;
      utterance.pitch = 1;
      state.utterance = utterance;
      ui.stopSpeech.hidden = false;
      setStatus('Falando em voz alta…');
      const finish = () => {
        if (state.utterance !== utterance) return;
        state.utterance = null;
        ui.stopSpeech.hidden = true;
        setStatus(statusReady);
      };
      utterance.onend = finish;
      utterance.onerror = finish;
      window.speechSynthesis.speak(utterance);
    } catch {
      state.utterance = null;
      ui.stopSpeech.hidden = true;
      setStatus(statusReady);
    }
  }

  function stopSpeaking() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    state.utterance = null;
    ui.stopSpeech.hidden = true;
    setStatus(statusReady);
  }

  function processMessage(message) {
    const cleanMessage = String(message || '').trim();
    if (!cleanMessage) {
      ui.input.focus();
      return;
    }
    if (state.listening && state.recognition) state.recognition.stop();
    hideNotice();
    recordMessage('user', cleanMessage);
    ui.input.value = '';
    updateComposer();
    setStatus('Pensando localmente…');

    let reply;
    try {
      if (!window.JonisIAEngine) throw new Error('Motor local indisponível');
      reply = window.JonisIAEngine.getLocalReply(cleanMessage, state.memories);
    } catch {
      reply = {
        text: 'Encontrei um problema ao processar isso. Sua mensagem ficou nesta conversa; tente de novo ou recarregue a página.',
        source: 'conversa',
      };
    }
    const answer = applyMemoryAction(reply);
    recordMessage('assistant', answer, reply.source || 'conversa');
    setStatus(reply.action === 'learn' ? 'Aprendi com você' : statusReady);
    speak(answer);
  }

  function updateComposer() {
    const length = ui.input.value.length;
    if (ui.characterCount) ui.characterCount.textContent = `${new Intl.NumberFormat('pt-BR').format(length)} / ${new Intl.NumberFormat('pt-BR').format(limits.inputLength)}`;
    ui.sendButton.disabled = !ui.input.value.trim();
    ui.input.style.height = 'auto';
    ui.input.style.height = `${Math.min(ui.input.scrollHeight, 180)}px`;
  }

  function stopListening() {
    if (!state.recognition || !state.listening) return;
    try { state.recognition.stop(); } catch { /* O reconhecimento pode já ter parado. */ }
  }

  function initSpeechRecognition() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      ui.micButton.title = 'Ditado por voz não compatível neste navegador';
      ui.micButton.setAttribute('aria-label', 'Ditado por voz não disponível neste navegador');
      return;
    }
    const recognition = new Recognition();
    recognition.lang = 'pt-BR';
    recognition.continuous = false;
    recognition.interimResults = true;
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
        ui.input.value = transcript.slice(0, limits.inputLength);
        updateComposer();
      }
    };
    recognition.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        showNotice('Permita o acesso ao microfone nas configurações do navegador. Você também pode escrever normalmente.');
      } else if (event.error === 'no-speech') {
        showNotice('Não ouvi nada. Toque no microfone e tente falar de novo.');
      } else if (event.error !== 'aborted') {
        showNotice('O ditado não funcionou desta vez. Você ainda pode escrever sua mensagem.');
      }
    };
    recognition.onend = () => {
      state.listening = false;
      ui.micButton.classList.remove('is-listening');
      ui.micButton.setAttribute('aria-label', 'Ditar mensagem');
      ui.micButton.title = 'Ditar mensagem';
      if (!state.utterance) setStatus(statusReady);
      if (ui.input.value.trim()) showNotice('Texto reconhecido. Confira e toque em enviar.', 4200);
    };
  }

  function closeSidebar() {
    const wasOpen = ui.body.classList.contains('sidebar-open');
    ui.body.classList.remove('sidebar-open');
    ui.mobileMenuButton.setAttribute('aria-expanded', 'false');
    if (wasOpen) ui.mobileMenuButton.focus();
  }

  function toggleSidebar(forceOpen) {
    const shouldOpen = typeof forceOpen === 'boolean' ? forceOpen : !ui.body.classList.contains('sidebar-open');
    ui.body.classList.toggle('sidebar-open', shouldOpen);
    ui.mobileMenuButton.setAttribute('aria-expanded', String(shouldOpen));
    if (shouldOpen) ui.closeSidebarButton.focus();
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;
    navigator.serviceWorker.register(new URL('./service-worker.js', location.href), { scope: './' }).catch(() => {
      // A conversa continua funcionando se o navegador não permitir instalar o cache offline.
    });
  }

  ui.form.addEventListener('submit', (event) => {
    event.preventDefault();
    processMessage(ui.input.value);
  });
  ui.input.addEventListener('input', updateComposer);
  ui.input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      ui.form.requestSubmit();
    }
  });
  ui.micButton.addEventListener('click', () => {
    if (!state.recognition) {
      showNotice('O ditado por voz não está disponível neste navegador. Você pode escrever normalmente.');
      return;
    }
    if (state.listening) {
      stopListening();
      return;
    }
    try {
      state.recognition.start();
    } catch {
      showNotice('Não foi possível iniciar o microfone. Aguarde um instante e tente novamente.');
    }
  });
  ui.stopSpeech.addEventListener('click', stopSpeaking);
  ui.newChatButton.addEventListener('click', startConversation);
  ui.newChatTopButton.addEventListener('click', startConversation);
  ui.openMemoriesButton.addEventListener('click', openMemoryDialog);
  ui.openMemoriesTopButton.addEventListener('click', openMemoryDialog);
  ui.closeMemoryDialog.addEventListener('click', closeMemoryDialog);
  ui.memoryDialog.addEventListener('click', (event) => {
    if (event.target === ui.memoryDialog) closeMemoryDialog();
  });
  ui.memoryDialog.addEventListener('close', () => {
    if (state.previousFocus && typeof state.previousFocus.focus === 'function') state.previousFocus.focus();
  });
  ui.clearMemoriesButton.addEventListener('click', clearAllMemories);
  ui.exportMemoriesButton.addEventListener('click', exportMemories);
  ui.dismissNotice.addEventListener('click', hideNotice);
  ui.mobileMenuButton.addEventListener('click', () => toggleSidebar());
  ui.closeSidebarButton.addEventListener('click', closeSidebar);
  ui.sidebarScrim.addEventListener('click', closeSidebar);
  document.querySelectorAll('[data-prompt]').forEach((button) => {
    button.addEventListener('click', () => processMessage(button.dataset.prompt || ''));
  });
  document.querySelectorAll('.workspace-nav a').forEach((link) => link.addEventListener('click', closeSidebar));
  $('#exploreLink').addEventListener('click', (event) => {
    if (!ui.body.classList.contains('has-chat')) return;
    event.preventDefault();
    startConversation();
    window.requestAnimationFrame(() => $('#suggestions').scrollIntoView({ behavior: 'smooth', block: 'start' }));
  });
  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && !ui.memoryDialog.open) {
      event.preventDefault();
      startConversation();
    } else if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'm') {
      event.preventDefault();
      if (!ui.memoryDialog.open) openMemoryDialog();
    } else if (event.key === 'Escape' && ui.body.classList.contains('sidebar-open')) {
      closeSidebar();
    }
  });
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    state.installPrompt = event;
    ui.installButton.hidden = false;
  });
  ui.installButton.addEventListener('click', async () => {
    if (!state.installPrompt) return;
    state.installPrompt.prompt();
    await state.installPrompt.userChoice;
    state.installPrompt = null;
    ui.installButton.hidden = true;
  });
  window.addEventListener('appinstalled', () => showToast('Jonis.IA instalada neste dispositivo.'));

  loadMemories();
  loadConversations();
  initSpeechRecognition();
  if ('speechSynthesis' in window) {
    loadVoices();
    window.speechSynthesis.addEventListener?.('voiceschanged', loadVoices);
  }
  renderMemoryList();
  renderConversation();
  updateComposer();
  if (!state.storageAvailable) reportStorageProblem();
  registerServiceWorker();
})();
