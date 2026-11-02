(() => {
  'use strict';

  const STORAGE_KEY = 'ia-voz-config-v1';
  const DEFAULT_CONFIG = {
    name: 'Assistente',
    rules: [
      'Responda sempre em português do Brasil.',
      'Seja direto e natural, como numa conversa falada.',
      'Use respostas curtas (até 3 frases), a menos que eu peça mais detalhes.',
    ].join('\n'),
    speak: true,
    lang: 'pt-BR',
    rate: 1,
  };

  const $ = (id) => document.getElementById(id);
  const els = {
    log: $('log'),
    micBtn: $('micBtn'),
    micHint: $('micHint'),
    textForm: $('textForm'),
    textInput: $('textInput'),
    errorBox: $('errorBox'),
    settings: $('settings'),
    settingsBtn: $('settingsBtn'),
    newChatBtn: $('newChatBtn'),
    title: $('assistantTitle'),
    statusDot: $('statusDot'),
    nameInput: $('nameInput'),
    rulesInput: $('rulesInput'),
    speakToggle: $('speakToggle'),
    langSelect: $('langSelect'),
    rateInput: $('rateInput'),
    rateValue: $('rateValue'),
    saveBtn: $('saveBtn'),
    resetRulesBtn: $('resetRulesBtn'),
    saveMsg: $('saveMsg'),
  };

  let config = loadConfig();
  let history = [];
  let busy = false;
  let listening = false;
  let recognition = null;

  // ---------- configuração ----------
  function loadConfig() {
    try {
      return { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') };
    } catch {
      return { ...DEFAULT_CONFIG };
    }
  }

  function rulesList() {
    return config.rules.split(/\r?\n/).map((r) => r.trim()).filter(Boolean);
  }

  function fillSettingsForm() {
    els.nameInput.value = config.name;
    els.rulesInput.value = config.rules;
    els.speakToggle.checked = config.speak;
    els.langSelect.value = config.lang;
    els.rateInput.value = config.rate;
    els.rateValue.textContent = Number(config.rate).toFixed(1);
  }

  function applyName() {
    els.title.textContent = config.name;
    document.title = `${config.name} — IA por voz`;
  }

  // ---------- UI helpers ----------
  function addMessage(role, text) {
    const div = document.createElement('div');
    div.className = `msg ${role}`;
    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = role === 'user' ? 'Você' : config.name;
    const body = document.createElement('p');
    body.textContent = text;
    div.append(who, body);
    els.log.appendChild(div);
    els.log.scrollTop = els.log.scrollHeight;
    return div;
  }

  function showError(msg) {
    els.errorBox.textContent = msg;
    els.errorBox.hidden = !msg;
  }

  function setBusy(state) {
    busy = state;
    els.textInput.disabled = state;
    els.micBtn.disabled = state || !SpeechRec;
    els.statusDot.classList.toggle('busy', state);
  }

  // ---------- voz: saída (síntese) ----------
  function speak(text) {
    if (!config.speak || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = config.lang;
    u.rate = Number(config.rate) || 1;
    const voice = window.speechSynthesis
      .getVoices()
      .find((v) => v.lang && v.lang.toLowerCase().startsWith(config.lang.toLowerCase()));
    if (voice) u.voice = voice;
    window.speechSynthesis.speak(u);
  }

  function stopSpeaking() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }

  // ---------- voz: entrada (reconhecimento) ----------
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition || null;

  function setupRecognition() {
    if (!SpeechRec) {
      els.micBtn.disabled = true;
      els.micHint.textContent = 'Seu navegador não suporta reconhecimento de voz. Use o Chrome ou o Edge, ou digite.';
      return;
    }
    recognition = new SpeechRec();
    recognition.continuous = false;
    recognition.interimResults = true;

    let finalText = '';
    recognition.onstart = () => {
      finalText = '';
      listening = true;
      els.micBtn.setAttribute('aria-pressed', 'true');
      els.micBtn.classList.add('live');
      els.micHint.textContent = 'Ouvindo… toque de novo para cancelar';
    };
    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      els.textInput.value = (finalText + interim).trim();
    };
    recognition.onerror = (event) => {
      if (event.error !== 'aborted' && event.error !== 'no-speech') {
        showError(`Erro no microfone: ${event.error}. Verifique a permissão do navegador.`);
      }
    };
    recognition.onend = () => {
      listening = false;
      els.micBtn.setAttribute('aria-pressed', 'false');
      els.micBtn.classList.remove('live');
      els.micHint.textContent = 'Toque no microfone e fale';
      const text = els.textInput.value.trim();
      if (text && !busy) {
        els.textInput.value = '';
        send(text);
      }
    };
  }

  function toggleMic() {
    if (!recognition) return;
    if (listening) {
      recognition.stop();
      return;
    }
    stopSpeaking();
    showError('');
    els.textInput.value = '';
    try {
      recognition.lang = config.lang;
      recognition.start();
    } catch (err) {
      showError(`Não foi possível iniciar o microfone: ${err.message}`);
    }
  }

  // ---------- envio ----------
  async function send(text) {
    showError('');
    addMessage('user', text);
    history.push({ role: 'user', content: text });
    setBusy(true);
    const thinking = addMessage('assistant', '…');
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: config.name,
          rules: rulesList(),
          messages: history,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Erro HTTP ${res.status}`);
      thinking.remove();
      addMessage('assistant', data.reply);
      history.push({ role: 'assistant', content: data.reply });
      speak(data.reply);
    } catch (err) {
      thinking.remove();
      history.pop();
      showError(err.message);
    } finally {
      setBusy(false);
      els.textInput.focus();
    }
  }

  els.textForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = els.textInput.value.trim();
    if (!text || busy) return;
    els.textInput.value = '';
    send(text);
  });

  els.micBtn.addEventListener('click', toggleMic);

  // ---------- configurações ----------
  els.settingsBtn.addEventListener('click', () => {
    const open = els.settings.hidden;
    els.settings.hidden = !open;
    els.settingsBtn.setAttribute('aria-expanded', String(open));
    if (open) fillSettingsForm();
  });

  els.rateInput.addEventListener('input', () => {
    els.rateValue.textContent = Number(els.rateInput.value).toFixed(1);
  });

  els.saveBtn.addEventListener('click', () => {
    config = {
      name: els.nameInput.value.trim().slice(0, 40) || 'Assistente',
      rules: els.rulesInput.value.slice(0, 10000),
      speak: els.speakToggle.checked,
      lang: els.langSelect.value,
      rate: Number(els.rateInput.value),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    applyName();
    els.saveMsg.textContent = 'Salvo. As novas regras valem a partir da próxima mensagem.';
    setTimeout(() => (els.saveMsg.textContent = ''), 4000);
  });

  els.resetRulesBtn.addEventListener('click', () => {
    els.rulesInput.value = DEFAULT_CONFIG.rules;
    els.nameInput.value = DEFAULT_CONFIG.name;
  });

  els.newChatBtn.addEventListener('click', () => {
    history = [];
    els.log.innerHTML = '';
    stopSpeaking();
    showError('');
  });

  // ---------- início ----------
  applyName();
  setupRecognition();
  fillSettingsForm();

  fetch('/api/status')
    .then((r) => r.json())
    .then((s) => {
      if (!s.configured) {
        showError('Servidor sem chave de IA. Defina LLM_API_KEY e reinicie o servidor.');
      }
    })
    .catch(() => showError('Não foi possível falar com o servidor.'));

  addMessage('assistant', 'Olá! Toque no microfone ou digite para começar.');
})();
