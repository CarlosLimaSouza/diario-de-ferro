// ---------- Estado ----------
let currentUser = null;
let SCHEDULE = null; // { groups: [{key,label}] } — vem de /api/schedule
let scheduleDraft = []; // rótulos em edição no painel de cronograma
let EXERCISES = null; // { [groupKey]: [...], unassigned: [...] } — vem de /api/my-exercises
let ALL_EXERCISES = [];
let CATALOG = [];
let vapidPublicKey = null; // pré-buscado no boot pra manter o handler de clique curto (subscribe() precisa de gesto do usuário "fresco")
let currentDateKey = fmt(new Date());
let currentDay = null; // { date, dayType, present, exercises }
let summary = []; // [{date, dayType, present}]
let audioCtx = null;
let activeSession = null; // {startedAt, restEndsAt} — vem de /api/session/state
let sessionTickHandle = null;

const MUSCLE_LABELS = {
  peito: 'Peito', costas: 'Costas', pernas: 'Pernas', gluteos: 'Glúteos',
  ombros: 'Ombros', biceps: 'Bíceps', triceps: 'Tríceps', abdomen: 'Abdômen',
  panturrilha: 'Panturrilha', cardio: 'Cardio',
};
const EQUIP_LABELS = {
  barra: 'Barra', halteres: 'Halteres', maquina: 'Máquina', cabo: 'Cabo/Polia',
  peso_corporal: 'Peso corporal', kettlebell: 'Kettlebell', cardio: 'Cardio',
};
const EQUIP_KEYS = Object.keys(EQUIP_LABELS);

// ---------- Utilitários de data ----------
function fmt(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function parseKey(k) { return new Date(k + 'T00:00:00'); }
function addDays(d, n) { const nd = new Date(d); nd.setDate(nd.getDate() + n); return nd; }
function labelPT(dateKey) {
  const d = parseKey(dateKey);
  return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
}

// ---------- API ----------
async function apiGet(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('GET ' + url + ' falhou');
  return r.json();
}
async function apiPost(url, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error('POST ' + url + ' falhou');
  return r.json();
}
async function apiDelete(url) {
  const r = await fetch(url, { method: 'DELETE' });
  if (!r.ok) throw new Error('DELETE ' + url + ' falhou');
  return r.json();
}
async function apiPut(url, body) {
  const r = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error('PUT ' + url + ' falhou');
  return r.json();
}

// ---------- Cronograma: helpers ----------
function groupIndex(key) {
  const idx = SCHEDULE.groups.findIndex(g => g.key === key);
  return idx >= 0 ? idx : 0;
}
function groupLabel(key) {
  const g = SCHEDULE.groups.find(g => g.key === key);
  return g ? g.label : key;
}

// ---------- Som ----------
function getAudioCtx() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    audioCtx = new Ctx();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}
function tone(freq, start, duration, type, gainPeak) {
  const ctx = getAudioCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type || 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, ctx.currentTime + start);
  gain.gain.linearRampToValueAtTime(gainPeak || 0.15, ctx.currentTime + start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(ctx.currentTime + start);
  osc.stop(ctx.currentTime + start + duration + 0.02);
}
function playTick(checked) {
  try {
    if (checked) { tone(880, 0, 0.08, 'sine', 0.12); tone(1320, 0.03, 0.06, 'sine', 0.08); }
    else { tone(440, 0, 0.06, 'sine', 0.08); }
  } catch (e) { /* áudio pode não estar disponível ainda */ }
}
function playCelebration() {
  try {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.09, 0.22, 'triangle', 0.14));
  } catch (e) {}
}

// ---------- Toast ----------
let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

function flagSave(msg) {
  const el = document.getElementById('saveFlag');
  el.textContent = msg;
  setTimeout(() => { if (el.textContent === msg) el.textContent = ''; }, 1400);
}

// ---------- Autenticação ----------
async function init() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
  apiGet('/api/push/public-key').then(r => { vapidPublicKey = r.publicKey; }).catch(() => {});
  bindAuthEvents();
  bindOnboardingEvents();
  bindStaticEvents();
  await checkAuth();
}

async function checkAuth() {
  let user;
  try {
    user = await apiGet('/api/auth/me');
  } catch (e) {
    showAuth();
    return;
  }
  currentUser = user;
  showApp();
  try {
    await bootApp();
  } catch (e) {
    console.error(e);
    showToast('Erro ao carregar seus dados. Tente recarregar a página.');
  }
}

function showAuth() {
  document.getElementById('authView').hidden = false;
  document.getElementById('appRoot').hidden = true;
}

function showApp() {
  document.getElementById('authView').hidden = true;
  document.getElementById('appRoot').hidden = false;
  document.getElementById('userGreeting').textContent = currentUser ? `Olá, ${currentUser.name}` : '';
}

function bindAuthEvents() {
  document.querySelectorAll('.auth-tab-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.auth-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('loginForm').hidden = btn.dataset.authtab !== 'login';
      document.getElementById('signupForm').hidden = btn.dataset.authtab !== 'signup';
      document.getElementById('authError').textContent = '';
    };
  });

  document.getElementById('loginForm').onsubmit = async (e) => {
    e.preventDefault();
    await submitAuth('/api/auth/login', {
      email: document.getElementById('loginEmail').value,
      password: document.getElementById('loginPassword').value,
    });
  };

  document.getElementById('signupForm').onsubmit = async (e) => {
    e.preventDefault();
    await submitAuth('/api/auth/signup', {
      name: document.getElementById('signupName').value,
      email: document.getElementById('signupEmail').value,
      password: document.getElementById('signupPassword').value,
    });
  };
}

async function submitAuth(url, body) {
  const errEl = document.getElementById('authError');
  errEl.textContent = '';
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await r.json();
    if (!r.ok) { errEl.textContent = data.error || 'Algo deu errado'; return; }
    currentUser = data;
    if (url === '/api/auth/signup') {
      showOnboarding();
    } else {
      showApp();
      await bootApp();
    }
  } catch (e) {
    errEl.textContent = 'Erro de conexão. Tente novamente.';
  }
}

// ---------- Onboarding (pós-cadastro) ----------
function showOnboarding() {
  document.getElementById('authView').hidden = true;
  document.getElementById('appRoot').hidden = true;
  document.getElementById('onboardingPreview').hidden = true;
  document.getElementById('onboardingView').hidden = false;
  buildEquipGrid(document.getElementById('onbEquipGrid'));
}

async function finishOnboarding() {
  document.getElementById('onboardingView').hidden = true;
  showApp();
  await bootApp();
}

function bindOnboardingEvents() {
  const refs = {
    goal: document.getElementById('onbGoal'),
    days: document.getElementById('onbDays'),
    level: document.getElementById('onbLevel'),
    sex: document.getElementById('onbSex'),
    equipGrid: document.getElementById('onbEquipGrid'),
  };
  let lastPreview = null;

  const doGenerate = async () => {
    const groups = await generatePlanPreview(refs, document.getElementById('onboardingPreview'), document.getElementById('onboardingPreviewGroups'));
    if (groups) lastPreview = groups;
  };

  document.getElementById('onboardingGenerateBtn').onclick = doGenerate;
  document.getElementById('onboardingRegenBtn').onclick = doGenerate;

  document.getElementById('onboardingApplyBtn').onclick = async () => {
    await saveProfileFromRefs(refs);
    if (lastPreview) await applyPlanPreview(lastPreview);
    await finishOnboarding();
  };

  document.getElementById('onboardingSkipBtn').onclick = async () => {
    await finishOnboarding();
  };
}

async function logout() {
  try { await apiPost('/api/auth/logout', {}); } catch (e) {}
  location.reload();
}

// ---------- Carregamento inicial do app (pós-login) ----------
async function bootApp() {
  CATALOG = await apiGet('/api/catalog');
  populateCatalogFilters();
  await loadSchedule();
  initScheduleDraft();
  await loadMyExercises();
  populateHistSelect();
  await loadSummary();
  await loadDay(currentDateKey);
  await loadSessionState();
}

async function loadSchedule() {
  SCHEDULE = await apiGet('/api/schedule');
}

async function loadMyExercises() {
  EXERCISES = await apiGet('/api/my-exercises');
  ALL_EXERCISES = Object.values(EXERCISES).flat();
}

// ---------- Render: cabeçalho do dia ----------
function renderDay() {
  document.getElementById('dayDateLabel').textContent = labelPT(currentDay.date);
  const badge = document.getElementById('dayTypeBadge');
  badge.textContent = groupLabel(currentDay.dayType);
  badge.className = 'day-type-badge grp' + groupIndex(currentDay.dayType);

  renderDayTypeToggle();
  renderTodayActions();
  renderExercises();
  renderCalendar();
  renderStreak();
}

// Some botão de trocar treino quando hoje já foi concluído — não faz
// sentido decidir de novo depois que o treino do dia já foi registrado.
function renderDayTypeToggle() {
  const wrap = document.getElementById('daytypeToggle');
  wrap.innerHTML = '';
  const locked = currentDay.status === 'trained';
  if (!SCHEDULE || SCHEDULE.groups.length <= 1 || locked) { wrap.hidden = true; return; }
  wrap.hidden = false;
  SCHEDULE.groups.forEach((g, i) => {
    const btn = document.createElement('button');
    btn.textContent = g.label;
    btn.className = currentDay.dayType === g.key ? 'sel-grp' + i : '';
    btn.onclick = () => overrideDayType(g.key);
    wrap.appendChild(btn);
  });
}

function renderTodayActions() {
  const completeBtn = document.getElementById('completeBtn');
  const restBtn = document.getElementById('restBtn');
  const status = currentDay.status;

  if (status === 'trained') {
    completeBtn.textContent = '✓ Concluído — toque pra desfazer';
    completeBtn.className = 'presence-btn on';
    restBtn.hidden = true;
    return;
  }

  completeBtn.textContent = 'Concluir treino de hoje';
  completeBtn.className = 'presence-btn';
  restBtn.hidden = false;

  if (status === 'rest') {
    restBtn.textContent = '✓ Folga — toque pra desfazer';
    restBtn.className = 'rest-btn on';
  } else {
    restBtn.textContent = 'Marcar como folga';
    restBtn.className = 'rest-btn';
  }
}

// ---------- Render: exercícios ----------
function computeCompleted(ex, data) {
  if (ex.type === 'bike') return !!data.done;
  return data.sets.every(s => !!s.done);
}

function renderExercises() {
  const container = document.getElementById('exerciseList');
  container.innerHTML = '';
  const list = EXERCISES[currentDay.dayType];

  if (!list || list.length === 0) {
    container.innerHTML = `<div class="my-ex-empty">Você ainda não importou exercícios pro treino "${groupLabel(currentDay.dayType)}". Vá na aba <strong>Meus Exercícios</strong> pra montar seu plano.</div>`;
    return;
  }

  list.forEach(ex => {
    const entry = currentDay.exercises[ex.key];
    if (!entry) return;
    const data = entry.data;

    const card = document.createElement('div');
    card.className = 'ex-card';

    const head = document.createElement('div');
    head.className = 'ex-head';
    const nameWrap = document.createElement('div');
    nameWrap.className = 'ex-name-wrap';
    const info = document.createElement('div');
    info.className = 'info-icon';
    info.textContent = 'i';
    info.onclick = () => openExerciseModal(ex);
    const nameCol = document.createElement('div');
    nameCol.innerHTML = `<div class="ex-name">${ex.name}</div>${ex.note ? `<div class="ex-note">${ex.note}</div>` : ''}`;
    nameWrap.appendChild(info);
    nameWrap.appendChild(nameCol);
    head.appendChild(nameWrap);

    const status = document.createElement('div');
    const completed = computeCompleted(ex, data);
    status.className = 'ex-status' + (completed ? ' done' : '');
    status.textContent = completed ? '✓ completo' : 'pendente';
    head.appendChild(status);

    card.appendChild(head);

    if (ex.type === 'bike') {
      const row = document.createElement('div');
      row.className = 'set-row bike';
      const check = buildSetCheck(!!data.done, (checked) => {
        data.done = checked;
        playTick(checked);
        refreshStatus(status, ex, data);
        saveExercise(ex, data);
        if (checked) triggerRestIfActive();
      });
      row.appendChild(check);
      const minInput = buildInput('number', 'Minutos', data.minutes, v => { data.minutes = v; });
      const lvlInput = buildInput('number', 'Nível de resistência', data.level, v => { data.level = v; });
      [minInput, lvlInput].forEach(inp => inp.onblur = () => saveExercise(ex, data));
      row.appendChild(minInput);
      row.appendChild(lvlInput);
      card.appendChild(row);
    } else {
      data.sets.forEach((s, i) => {
        const row = document.createElement('div');
        row.className = 'set-row' + (ex.type === 'time' ? ' time' : '');

        const check = buildSetCheck(!!s.done, (checked) => {
          s.done = checked;
          playTick(checked);
          refreshStatus(status, ex, data);
          saveExercise(ex, data);
          if (checked) triggerRestIfActive();
        });
        row.appendChild(check);

        const label = document.createElement('div');
        label.className = 'set-label';
        label.textContent = `Série ${i + 1}`;
        row.appendChild(label);

        if (ex.type === 'weight') {
          const wInput = buildInput('number', 'Kg', s.weight, v => { s.weight = v; });
          const rInput = buildInput('number', 'Reps', s.reps, v => { s.reps = v; });
          [wInput, rInput].forEach(inp => inp.onblur = () => saveExercise(ex, data));
          row.appendChild(wInput);
          row.appendChild(rInput);
        } else {
          const secInput = buildInput('number', 'Segundos', s.seconds, v => { s.seconds = v; });
          secInput.onblur = () => saveExercise(ex, data);
          row.appendChild(secInput);
        }
        card.appendChild(row);
      });
    }

    container.appendChild(card);
  });
}

function refreshStatus(statusEl, ex, data) {
  const completed = computeCompleted(ex, data);
  statusEl.className = 'ex-status' + (completed ? ' done' : '');
  statusEl.textContent = completed ? '✓ completo' : 'pendente';
}

function buildSetCheck(checked, onToggle) {
  const el = document.createElement('div');
  el.className = 'set-check' + (checked ? ' checked' : '');
  el.textContent = checked ? '✓' : '';
  el.onclick = () => {
    const now = !el.classList.contains('checked');
    el.classList.toggle('checked', now);
    el.textContent = now ? '✓' : '';
    onToggle(now);
  };
  return el;
}

function buildInput(type, placeholder, value, onInput) {
  const inp = document.createElement('input');
  inp.type = type;
  inp.placeholder = placeholder;
  inp.value = value === undefined || value === null ? '' : value;
  inp.oninput = () => onInput(inp.value);
  return inp;
}

// ---------- Salvar exercício ----------
function computeValueDetail(ex, data) {
  if (ex.type === 'weight') {
    let best = null;
    data.sets.forEach(s => {
      const w = parseFloat(s.weight);
      if (!isNaN(w) && (best === null || w > best.weight)) best = { weight: w, reps: s.reps };
    });
    if (!best) return { value: null, detail: '' };
    return { value: best.weight, detail: best.reps ? `${best.reps} reps` : '' };
  }
  if (ex.type === 'time') {
    let best = null;
    data.sets.forEach(s => {
      const sec = parseFloat(s.seconds);
      if (!isNaN(sec) && (best === null || sec > best)) best = sec;
    });
    return { value: best, detail: 'seg' };
  }
  if (ex.type === 'bike') {
    const min = parseFloat(data.minutes);
    return { value: isNaN(min) ? null : min, detail: data.level ? `nível ${data.level}` : '' };
  }
  return { value: null, detail: '' };
}

async function saveExercise(ex, data) {
  const completed = computeCompleted(ex, data);
  const { value, detail } = computeValueDetail(ex, data);
  try {
    const res = await apiPost(`/api/day/${currentDay.date}/exercise/${ex.key}`, { data, completed, value, detail });
    flagSave('salvo');
    if (res.isPR) {
      playCelebration();
      showToast(`🏆 Novo recorde em ${ex.name}!`);
    }
    celebrateUnlocks(res.gamification);
  } catch (e) {
    flagSave('erro ao salvar');
  }
}

// ---------- Concluir / folga / trocar treino ----------
// Os dois botões funcionam como toggle: clicar de novo no estado marcado
// desfaz a ação (evita ficar preso a um miss-click).
async function toggleComplete() {
  const isTrained = currentDay.status === 'trained';
  try {
    if (isTrained) {
      await apiPost(`/api/day/${currentDay.date}/uncomplete`, {});
      showToast('Conclusão desfeita');
    } else {
      const res = await apiPost(`/api/day/${currentDay.date}/complete`, {});
      playCelebration();
      showToast('🔥 Treino concluído!');
      setTimeout(() => celebrateUnlocks(res.gamification), 900);
    }
  } catch (e) { flagSave('erro ao salvar'); return; }
  await loadSummary();
  await loadDay(currentDay.date);
}

async function toggleRest() {
  const isRest = currentDay.status === 'rest';
  try {
    if (isRest) {
      await apiPost(`/api/day/${currentDay.date}/unrest`, {});
      showToast('Folga desmarcada');
    } else {
      await apiPost(`/api/day/${currentDay.date}/rest`, {});
      showToast('Folga marcada');
    }
  } catch (e) { flagSave('erro ao salvar'); return; }
  await loadSummary();
  await loadDay(currentDay.date);
}

async function overrideDayType(groupKey) {
  if (currentDay.dayType === groupKey) return;
  try {
    await apiPost(`/api/day/${currentDay.date}/override`, { groupKey });
  } catch (e) { flagSave('erro ao salvar'); return; }
  await loadDay(currentDay.date);
}

// ---------- Sessão de treino / timer de descanso ----------
async function loadSessionState() {
  try { activeSession = await apiGet('/api/session/state'); } catch (e) { activeSession = { startedAt: null, restEndsAt: null }; }
  renderSessionWidget();
}

function formatClock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
}

function renderSessionWidget() {
  const startBtn = document.getElementById('startSessionBtn');
  const widget = document.getElementById('sessionWidget');
  clearInterval(sessionTickHandle);
  if (!activeSession || !activeSession.startedAt) {
    startBtn.hidden = false;
    widget.hidden = true;
    return;
  }
  startBtn.hidden = true;
  widget.hidden = false;
  tickSessionWidget();
  sessionTickHandle = setInterval(tickSessionWidget, 1000);
}

function tickSessionWidget() {
  if (!activeSession || !activeSession.startedAt) { clearInterval(sessionTickHandle); return; }
  const widget = document.getElementById('sessionWidget');
  const modeEl = document.getElementById('sessionWidgetMode');
  const clockEl = document.getElementById('sessionWidgetClock');
  const now = Date.now();
  const resting = activeSession.restEndsAt && activeSession.restEndsAt > now;

  if (resting) {
    widget.classList.add('resting');
    modeEl.textContent = 'DESCANSO';
    clockEl.textContent = formatClock((activeSession.restEndsAt - now) / 1000);
  } else {
    if (activeSession.restEndsAt) {
      activeSession.restEndsAt = null;
      playCelebration();
      showToast('⏱️ Descanso terminado!');
    }
    widget.classList.remove('resting');
    modeEl.textContent = 'TREINANDO';
    clockEl.textContent = formatClock((now - activeSession.startedAt) / 1000);
  }
}

async function startSession() {
  try {
    activeSession = await apiPost('/api/session/start', {});
    renderSessionWidget();
    showToast('Treino iniciado! Bora.');
  } catch (e) { flagSave('erro ao iniciar treino'); }
}

async function cancelSession() {
  if (!confirm('Cancelar o treino em andamento? O tempo não vai ser salvo.')) return;
  try { await apiPost('/api/session/cancel', {}); } catch (e) { /* segue e limpa localmente de qualquer forma */ }
  activeSession = { startedAt: null, restEndsAt: null };
  renderSessionWidget();
}

// Disparado quando uma série é marcada feita — só faz algo se houver treino
// em andamento; não trava o registro do exercício em caso de erro.
async function triggerRestIfActive() {
  if (!activeSession || !activeSession.startedAt) return;
  try {
    activeSession = await apiPost('/api/session/rest', {});
    renderSessionWidget();
  } catch (e) { /* silencioso */ }
}

// ---------- Push (notificações em segundo plano) ----------
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

async function refreshPushButton() {
  const btn = document.getElementById('pushToggleBtn');
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    btn.textContent = 'Notificações não suportadas neste navegador';
    btn.disabled = true;
    return;
  }
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      btn.textContent = '✓ Notificações ativadas — toque pra desativar';
      btn.classList.add('on');
    } else {
      btn.textContent = 'Ativar notificações push';
      btn.classList.remove('on');
    }
  } catch (e) { /* service worker ainda não pronto */ }
}

async function togglePush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  if (existing) {
    try { await apiPost('/api/push/unsubscribe', { endpoint: existing.endpoint }); } catch (e) {}
    await existing.unsubscribe();
    showToast('Notificações desativadas');
    refreshPushButton();
    return;
  }

  // A cadeia depois daqui precisa ser curta: subscribe() só funciona com o
  // gesto de clique ainda "fresco" — por isso a chave pública já vem
  // pré-buscada no boot (vapidPublicKey) em vez de um fetch aqui no meio.
  if (!vapidPublicKey) {
    try { ({ publicKey: vapidPublicKey } = await apiGet('/api/push/public-key')); }
    catch (e) { flagSave('erro ao ativar notificações'); return; }
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') { flagSave('permissão negada'); return; }
  try {
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
    await apiPost('/api/push/subscribe', sub.toJSON());
    showToast('Notificações ativadas!');
  } catch (e) {
    flagSave('erro ao ativar notificações');
    return;
  }
  refreshPushButton();
}

// ---------- Calendário ----------
function renderCalendar() {
  const cal = document.getElementById('calendar');
  cal.innerHTML = '';
  const today = fmt(new Date());
  const days = [];
  for (let i = 27; i >= 0; i--) days.push(fmt(addDays(new Date(), -i)));

  const byDate = {};
  summary.forEach(s => { byDate[s.date] = s; });

  days.forEach(dk => {
    const cell = document.createElement('div');
    const info = byDate[dk];
    let cls = 'cal-cell';
    if (info && info.status === 'trained') cls += ' grp' + groupIndex(info.groupKey) + '-on';
    else if (info && info.status === 'rest') cls += ' rest-on';
    if (dk === today) cls += ' today';
    if (dk === currentDay.date) cls += ' selected';
    cell.className = cls;
    cell.title = dk;
    cell.textContent = String(parseKey(dk).getDate());
    cal.appendChild(cell);
  });
}

// ---------- Streak ----------
// Folga não quebra a sequência (é descanso planejado), mas também não soma
// ao contador — só dias efetivamente treinados contam. Um dia em branco
// (nem treino nem folga) quebra a sequência.
function renderStreak(pulse) {
  const byDate = {};
  summary.forEach(s => { byDate[s.date] = s; });
  const today = fmt(new Date());
  let cursor = new Date();
  if (!(byDate[today] && byDate[today].status === 'trained')) cursor = addDays(cursor, -1);
  let streak = 0;
  while (true) {
    const key = fmt(cursor);
    const info = byDate[key];
    if (info && info.status === 'trained') { streak++; cursor = addDays(cursor, -1); }
    else if (info && info.status === 'rest') { cursor = addDays(cursor, -1); }
    else break;
  }
  const el = document.getElementById('streakNum');
  el.textContent = streak;
  if (pulse) { el.classList.add('pulse'); setTimeout(() => el.classList.remove('pulse'), 150); }
}

// ---------- Questionário / gerador de plano (Simplificado + onboarding) ----------
function buildEquipGrid(container) {
  container.innerHTML = '';
  EQUIP_KEYS.forEach(key => {
    const label = document.createElement('label');
    label.className = 'quiz-equip-item';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = key;
    input.checked = true; // assume que a academia tem tudo; a pessoa desmarca o que não tem
    label.appendChild(input);
    label.appendChild(document.createTextNode(' ' + EQUIP_LABELS[key]));
    container.appendChild(label);
  });
}

function readQuizAnswers(refs) {
  const equipment = Array.from(refs.equipGrid.querySelectorAll('input:checked')).map(i => i.value);
  return {
    goal: refs.goal.value,
    daysPerWeek: Number(refs.days.value),
    level: refs.level.value,
    sex: refs.sex.value || null,
    equipment,
  };
}

async function saveProfileFromRefs(refs) {
  try { await apiPut('/api/profile', readQuizAnswers(refs)); } catch (e) { /* segue sem travar o onboarding */ }
}

async function generatePlanPreview(refs, previewEl, groupsListEl) {
  const answers = readQuizAnswers(refs);
  let result;
  try {
    result = await apiPost('/api/plan/generate', answers);
  } catch (e) { flagSave('erro ao gerar sugestão'); return null; }
  renderPlanPreviewGroups(result.groups, groupsListEl);
  previewEl.hidden = false;
  return result.groups;
}

function renderPlanPreviewGroups(groups, container) {
  container.innerHTML = '';
  groups.forEach((g, i) => {
    const block = document.createElement('div');
    block.className = 'quiz-preview-group';
    const title = document.createElement('div');
    title.className = 'my-ex-group-title grp' + i;
    title.textContent = g.label;
    block.appendChild(title);

    if (!g.exercises.length) {
      const empty = document.createElement('div');
      empty.className = 'my-ex-empty';
      empty.textContent = 'Nenhum exercício compatível com os equipamentos escolhidos.';
      block.appendChild(empty);
    } else {
      g.exercises.forEach(ex => {
        const row = document.createElement('div');
        row.className = 'quiz-preview-ex-row';
        row.textContent = ex.name;
        block.appendChild(row);
      });
    }
    container.appendChild(block);
  });
}

async function applyPlanPreview(groups) {
  const payload = { groups: groups.map(g => ({ label: g.label, exerciseKeys: g.exercises.map(ex => ex.key) })) };
  try {
    await apiPost('/api/plan/apply', payload);
  } catch (e) { flagSave('erro ao aplicar plano'); return false; }
  return true;
}

// ---------- Meus Exercícios: Avançado / Simplificado ----------
function switchExMode(mode) {
  document.querySelectorAll('.ex-mode-btn').forEach(b => b.classList.toggle('active', b.dataset.exmode === mode));
  document.getElementById('exAvancado').hidden = mode !== 'avancado';
  document.getElementById('exSimplificado').hidden = mode !== 'simplificado';
}

function bindSimplificado() {
  const refs = {
    goal: document.getElementById('quizGoal'),
    days: document.getElementById('quizDays'),
    level: document.getElementById('quizLevel'),
    sex: document.getElementById('quizSex'),
    equipGrid: document.getElementById('quizEquipGrid'),
  };
  buildEquipGrid(refs.equipGrid);
  let lastPreview = null;

  const doGenerate = async () => {
    const groups = await generatePlanPreview(refs, document.getElementById('quizPreview'), document.getElementById('quizPreviewGroups'));
    if (groups) lastPreview = groups;
  };

  document.getElementById('quizGenerateBtn').onclick = doGenerate;
  document.getElementById('quizRegenerateBtn').onclick = doGenerate;

  document.getElementById('quizApplyBtn').onclick = async () => {
    if (!lastPreview) return;
    await saveProfileFromRefs(refs);
    const ok = await applyPlanPreview(lastPreview);
    if (!ok) return;
    showToast('Plano aplicado!');
    await loadSchedule();
    initScheduleDraft();
    await loadMyExercises();
    renderCatalog();
    renderMyExLists();
    await loadDay(currentDateKey);
    await loadSummary();
    switchExMode('avancado');
  };
}

// ---------- Meus Exercícios (catálogo + importação) ----------
function populateCatalogFilters() {
  const muscleSel = document.getElementById('catalogMuscleFilter');
  const equipSel = document.getElementById('catalogEquipFilter');
  muscleSel.innerHTML = '<option value="">Todos os grupos</option>' +
    Object.entries(MUSCLE_LABELS).map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
  equipSel.innerHTML = '<option value="">Todos os equipamentos</option>' +
    Object.entries(EQUIP_LABELS).map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
}

function computeImportedMap() {
  const map = {};
  SCHEDULE.groups.forEach(g => {
    (EXERCISES[g.key] || []).forEach(ex => { map[ex.key] = g.key; });
  });
  return map;
}

function renderCatalog() {
  const container = document.getElementById('catalogList');
  container.innerHTML = '';

  const search = document.getElementById('catalogSearch').value.trim().toLowerCase();
  const muscle = document.getElementById('catalogMuscleFilter').value;
  const equip = document.getElementById('catalogEquipFilter').value;
  const importedMap = computeImportedMap();

  const filtered = CATALOG.filter(ex => {
    if (muscle && ex.muscleGroup !== muscle) return false;
    if (equip && ex.equipment !== equip) return false;
    if (search && !ex.name.toLowerCase().includes(search)) return false;
    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div class="catalog-empty">Nenhum exercício encontrado com esses filtros.</div>`;
    return;
  }

  filtered.forEach(ex => {
    const card = document.createElement('div');
    card.className = 'catalog-card';

    const head = document.createElement('div');
    head.className = 'catalog-card-head';
    const info = document.createElement('div');
    info.className = 'info-icon';
    info.textContent = 'i';
    info.onclick = () => openExerciseModal(ex);
    const nameCol = document.createElement('div');
    nameCol.className = 'catalog-name-col';
    nameCol.innerHTML = `<div class="ex-name">${ex.name}</div>` +
      `<div class="catalog-tags"><span class="tag">${MUSCLE_LABELS[ex.muscleGroup] || ex.muscleGroup}</span>` +
      `<span class="tag">${EQUIP_LABELS[ex.equipment] || ex.equipment}</span></div>`;
    head.appendChild(info);
    head.appendChild(nameCol);
    card.appendChild(head);

    card.appendChild(buildAddControl(ex, importedMap[ex.key]));

    container.appendChild(card);
  });
}

function buildAddControl(ex, current) {
  const wrap = document.createElement('div');
  wrap.className = 'catalog-actions';

  if (current) {
    const badge = document.createElement('span');
    badge.className = 'imported-badge grp' + groupIndex(current);
    badge.textContent = '✓ ' + groupLabel(current);
    wrap.appendChild(badge);
  }

  if (SCHEDULE.groups.length > 1) {
    const sel = document.createElement('select');
    sel.className = 'catalog-group-select';
    SCHEDULE.groups.forEach(g => {
      const opt = document.createElement('option');
      opt.value = g.key;
      opt.textContent = g.label;
      if (g.key === current) opt.selected = true;
      sel.appendChild(opt);
    });
    wrap.appendChild(sel);

    const btn = document.createElement('button');
    btn.className = 'catalog-btn';
    btn.textContent = current ? 'Mover' : '+ Adicionar';
    btn.onclick = () => importExercise(ex.key, sel.value);
    wrap.appendChild(btn);
  } else {
    const onlyKey = SCHEDULE.groups[0].key;
    const btn = document.createElement('button');
    btn.className = 'catalog-btn';
    btn.textContent = current ? '✓ Importado' : '+ Adicionar';
    btn.disabled = !!current;
    btn.onclick = () => importExercise(ex.key, onlyKey);
    wrap.appendChild(btn);
  }

  if (current) {
    const removeBtn = document.createElement('button');
    removeBtn.className = 'catalog-btn-ghost danger';
    removeBtn.textContent = 'Remover';
    removeBtn.onclick = () => removeExercise(ex.key);
    wrap.appendChild(removeBtn);
  }

  return wrap;
}

function renderMyExLists() {
  const container = document.getElementById('myExGroups');
  container.innerHTML = '';

  function row(ex, isUnassigned) {
    const r = document.createElement('div');
    r.className = 'my-ex-row';
    const info = document.createElement('div');
    info.className = 'info-icon';
    info.textContent = 'i';
    info.onclick = () => openExerciseModal(ex);
    const name = document.createElement('div');
    name.className = 'my-ex-row-name';
    name.textContent = ex.name;
    r.appendChild(info);
    r.appendChild(name);

    if (isUnassigned) {
      const sel = document.createElement('select');
      sel.className = 'catalog-group-select';
      SCHEDULE.groups.forEach(g => {
        const opt = document.createElement('option');
        opt.value = g.key;
        opt.textContent = g.label;
        sel.appendChild(opt);
      });
      const moveBtn = document.createElement('button');
      moveBtn.className = 'catalog-btn';
      moveBtn.textContent = 'Mover';
      moveBtn.onclick = () => importExercise(ex.key, sel.value);
      r.appendChild(sel);
      r.appendChild(moveBtn);
    }

    const removeBtn = document.createElement('button');
    removeBtn.className = 'catalog-btn-ghost danger';
    removeBtn.textContent = 'Remover';
    removeBtn.onclick = () => removeExercise(ex.key);
    r.appendChild(removeBtn);
    return r;
  }

  function block(title, colorClass, list, isUnassigned) {
    const wrap = document.createElement('div');
    wrap.className = 'my-ex-group';
    const titleEl = document.createElement('div');
    titleEl.className = 'my-ex-group-title ' + colorClass;
    titleEl.textContent = title;
    wrap.appendChild(titleEl);
    const listEl = document.createElement('div');
    listEl.className = 'my-ex-list';
    if (!list.length) listEl.innerHTML = '<div class="my-ex-empty">Nenhum exercício importado ainda.</div>';
    else list.forEach(ex => listEl.appendChild(row(ex, isUnassigned)));
    wrap.appendChild(listEl);
    return wrap;
  }

  SCHEDULE.groups.forEach((g, i) => {
    container.appendChild(block(g.label, 'grp' + i, EXERCISES[g.key] || [], false));
  });

  if (EXERCISES.unassigned && EXERCISES.unassigned.length) {
    container.appendChild(block('Sem grupo — reatribua', 'unassigned', EXERCISES.unassigned, true));
  }
}

// ---------- Painel de cronograma ----------
function initScheduleDraft() {
  scheduleDraft = SCHEDULE.groups.map(g => g.label);
  renderSchedulePanel();
}

function renderSchedulePanel() {
  document.querySelectorAll('#schedulePresets button').forEach(b => {
    b.classList.toggle('active', Number(b.dataset.count) === scheduleDraft.length);
  });
  const wrap = document.getElementById('scheduleLabels');
  wrap.innerHTML = '';
  if (scheduleDraft.length <= 1) { wrap.hidden = true; return; }
  wrap.hidden = false;
  scheduleDraft.forEach((label, i) => {
    const inp = document.createElement('input');
    inp.value = label;
    inp.placeholder = `Nome do treino ${i + 1}`;
    inp.oninput = () => { scheduleDraft[i] = inp.value; };
    wrap.appendChild(inp);
  });
}

function bindSchedulePanel() {
  document.querySelectorAll('#schedulePresets button').forEach(btn => {
    btn.onclick = () => {
      const count = Number(btn.dataset.count);
      const letters = ['A', 'B', 'C', 'D', 'E'];
      const next = [];
      for (let i = 0; i < count; i++) next.push(scheduleDraft[i] || letters[i]);
      scheduleDraft = next;
      renderSchedulePanel();
    };
  });

  document.getElementById('scheduleSave').onclick = async () => {
    const labels = scheduleDraft.map(l => l.trim()).filter(Boolean);
    if (labels.length !== scheduleDraft.length) { flagSave('todos os grupos precisam de nome'); return; }
    try {
      SCHEDULE = await apiPut('/api/schedule', { labels });
      initScheduleDraft();
      await loadMyExercises();
      renderCatalog();
      renderMyExLists();
      await loadDay(currentDateKey);
      await loadSummary();
      renderCalendar();
      showToast('Cronograma atualizado');
    } catch (e) {
      flagSave('erro ao salvar cronograma');
    }
  };
}

async function importExercise(key, category) {
  try {
    await apiPost('/api/my-exercises', { key, category });
    await loadMyExercises();
    renderCatalog();
    renderMyExLists();
    showToast('Exercício importado');
  } catch (e) { flagSave('erro ao importar'); }
}

async function removeExercise(key) {
  try {
    await apiDelete(`/api/my-exercises/${key}`);
    await loadMyExercises();
    renderCatalog();
    renderMyExLists();
  } catch (e) { flagSave('erro ao remover'); }
}

// ---------- Histórico ----------
function populateHistSelect() {
  const sel = document.getElementById('histSelect');
  sel.innerHTML = '';
  if (!ALL_EXERCISES.length) {
    sel.innerHTML = '<option value="">Nenhum exercício importado ainda</option>';
    return;
  }
  ALL_EXERCISES.forEach(ex => {
    const opt = document.createElement('option');
    opt.value = ex.key;
    opt.textContent = ex.name;
    sel.appendChild(opt);
  });
}

async function renderHistory() {
  populateHistSelect();
  const sel = document.getElementById('histSelect');
  const svg = document.getElementById('histChart');
  const table = document.getElementById('histTable');

  if (!ALL_EXERCISES.length) {
    svg.innerHTML = `<text x="300" y="100" text-anchor="middle" fill="#5F6567" font-family="JetBrains Mono" font-size="12">Importe exercícios em "Meus Exercícios" pra ver histórico aqui</text>`;
    table.innerHTML = '';
    return;
  }

  const key = sel.value || ALL_EXERCISES[0].key;
  let hist = [];
  try {
    hist = await apiGet(`/api/history/${key}`);
  } catch (e) { hist = []; }

  if (!hist || hist.length === 0) {
    svg.innerHTML = `<text x="300" y="100" text-anchor="middle" fill="#5F6567" font-family="JetBrains Mono" font-size="12">Sem registros ainda para este exercício</text>`;
    table.innerHTML = '';
    return;
  }

  const values = hist.map(h => h.value);
  const min = Math.min(...values), max = Math.max(...values);
  const pad = 24, w = 600, h = 200;
  const range = (max - min) || 1;

  const pts = hist.map((pt, i) => {
    const x = pad + (i * (w - 2 * pad) / Math.max(hist.length - 1, 1));
    const y = h - pad - ((pt.value - min) / range) * (h - 2 * pad);
    return { x, y, pt };
  });

  const polyline = pts.map(p => `${p.x},${p.y}`).join(' ');
  // Recordes pessoais ganham um anel maior, pra se destacar na linha.
  const circles = pts.map(p => p.pt.isPR
    ? `<circle cx="${p.x}" cy="${p.y}" r="6" fill="none" stroke="#C9A227" stroke-width="2"/><circle cx="${p.x}" cy="${p.y}" r="2.5" fill="#C9A227"/>`
    : `<circle cx="${p.x}" cy="${p.y}" r="3" fill="#C9A227"/>`
  ).join('');
  // Ancora o rótulo à esquerda quando o último ponto está perto da borda
  // esquerda (ex: um único ponto) — senão o texto sai do viewBox.
  const lastLabel = pts.length ? (() => {
    const p = pts[pts.length - 1];
    const anchor = p.x < 60 ? 'start' : 'end';
    return `<text x="${p.x}" y="${p.y - 10}" text-anchor="${anchor}" fill="#EDEBE6" font-family="JetBrains Mono" font-size="11">${values[values.length-1]}</text>`;
  })() : '';

  svg.innerHTML = `<polyline points="${polyline}" fill="none" stroke="#C9A227" stroke-width="2"/>${circles}${lastLabel}`;

  table.innerHTML = `<tr><th>Data</th><th>Valor</th><th>Detalhe</th></tr>` +
    hist.slice().reverse().slice(0, 15).map(pt => `<tr><td>${labelPT(pt.date)}</td><td>${pt.value}${pt.isPR ? ' 🏆' : ''}</td><td>${pt.detail || ''}</td></tr>`).join('');
}

// ---------- Perfil ----------
async function loadProfileTab() {
  let profile;
  try {
    profile = await apiGet('/api/profile');
  } catch (e) { flagSave('erro ao carregar perfil'); return; }
  populateProfileForm(profile);
  renderProfilePhotoPreview(profile);

  document.getElementById('metricDate').value = fmt(new Date());
  document.getElementById('progressDate').value = fmt(new Date());

  let metrics = [];
  try { metrics = await apiGet('/api/body-metrics'); } catch (e) { metrics = []; }
  renderMetricsTable(metrics);
  renderWeightChart(metrics);

  let gallery = [];
  try { gallery = await apiGet('/api/progress-photos'); } catch (e) { gallery = []; }
  renderProgressGallery(gallery);

  refreshPushButton();
  loadGamification();
  loadReminders();
}

function populateProfileForm(profile) {
  document.getElementById('profGoal').value = profile.goal || 'hipertrofia';
  document.getElementById('profDays').value = String(profile.daysPerWeek || 3);
  document.getElementById('profLevel').value = profile.level || 'intermediario';
  document.getElementById('profSex').value = profile.sex || '';
  document.getElementById('profBirthDate').value = profile.birthDate || '';
  document.getElementById('profHeight').value = profile.heightCm || '';
  document.getElementById('profRest').value = profile.restSeconds || 90;

  const grid = document.getElementById('profEquipGrid');
  buildEquipGrid(grid);
  const equipSet = new Set(profile.equipment || []);
  if (equipSet.size) {
    grid.querySelectorAll('input[type="checkbox"]').forEach(inp => {
      inp.checked = equipSet.has(inp.value);
    });
  }
}

function renderProfilePhotoPreview(profile) {
  const img = document.getElementById('profilePhotoPreview');
  const placeholder = document.getElementById('profilePhotoPlaceholder');
  if (profile.profilePhoto) {
    img.src = '/api/profile/photo?t=' + Date.now();
    img.hidden = false;
    placeholder.hidden = true;
  } else {
    img.hidden = true;
    placeholder.hidden = false;
  }
}

async function saveProfileTab() {
  const grid = document.getElementById('profEquipGrid');
  const equipment = Array.from(grid.querySelectorAll('input:checked')).map(i => i.value);
  const payload = {
    goal: document.getElementById('profGoal').value,
    daysPerWeek: Number(document.getElementById('profDays').value),
    level: document.getElementById('profLevel').value,
    sex: document.getElementById('profSex').value || null,
    birthDate: document.getElementById('profBirthDate').value || null,
    heightCm: document.getElementById('profHeight').value || null,
    restSeconds: document.getElementById('profRest').value || 90,
    equipment,
  };
  try {
    await apiPut('/api/profile', payload);
    showToast('Dados salvos');
  } catch (e) { flagSave('erro ao salvar'); }
}

async function uploadFile(url, file, extraFields) {
  const form = new FormData();
  form.append('photo', file);
  if (extraFields) Object.entries(extraFields).forEach(([k, v]) => form.append(k, v));
  const r = await fetch(url, { method: 'POST', body: form });
  if (!r.ok) throw new Error('upload falhou');
  return r.json();
}

function bindProfilePhotoInput() {
  document.getElementById('profilePhotoInput').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      await uploadFile('/api/profile/photo', file);
      const profile = await apiGet('/api/profile');
      renderProfilePhotoPreview(profile);
      showToast('Foto atualizada');
    } catch (err) { flagSave('erro ao enviar foto'); }
    e.target.value = '';
  };
}

// ---------- Métricas corporais ----------
function renderMetricsTable(metrics) {
  const table = document.getElementById('metricsTable');
  if (!metrics.length) { table.innerHTML = ''; return; }
  table.innerHTML = `<tr><th>Data</th><th>Peso</th><th>% Gordura</th><th></th></tr>` +
    metrics.slice().reverse().map(m => `
      <tr>
        <td>${labelPT(m.date)}</td>
        <td>${m.weightKg !== null ? m.weightKg + ' kg' : '—'}</td>
        <td>${m.bodyFatPct !== null ? m.bodyFatPct + '%' : '—'}</td>
        <td><button type="button" class="catalog-btn-ghost danger" data-metric-id="${m.id}">Remover</button></td>
      </tr>
    `).join('');
  table.querySelectorAll('[data-metric-id]').forEach(btn => {
    btn.onclick = async () => {
      try {
        await apiDelete(`/api/body-metrics/${btn.dataset.metricId}`);
        const metrics2 = await apiGet('/api/body-metrics');
        renderMetricsTable(metrics2);
        renderWeightChart(metrics2);
      } catch (e) { flagSave('erro ao remover'); }
    };
  });
}

function renderWeightChart(metrics) {
  const svg = document.getElementById('weightChart');
  const withWeight = metrics.filter(m => m.weightKg !== null);
  if (!withWeight.length) {
    svg.innerHTML = `<text x="300" y="90" text-anchor="middle" fill="#5F6567" font-family="JetBrains Mono" font-size="12">Registre seu peso pra ver o gráfico aqui</text>`;
    return;
  }
  const values = withWeight.map(m => m.weightKg);
  const min = Math.min(...values), max = Math.max(...values);
  const pad = 24, w = 600, h = 180;
  const range = (max - min) || 1;

  const pts = withWeight.map((m, i) => {
    const x = pad + (i * (w - 2 * pad) / Math.max(withWeight.length - 1, 1));
    const y = h - pad - ((m.weightKg - min) / range) * (h - 2 * pad);
    return { x, y };
  });

  const polyline = pts.map(p => `${p.x},${p.y}`).join(' ');
  const circles = pts.map(p => `<circle cx="${p.x}" cy="${p.y}" r="3" fill="#C9A227"/>`).join('');
  const lastPt = pts[pts.length - 1];
  const lastAnchor = lastPt.x < 60 ? 'start' : 'end';
  const lastLabel = `<text x="${lastPt.x}" y="${lastPt.y - 10}" text-anchor="${lastAnchor}" fill="#EDEBE6" font-family="JetBrains Mono" font-size="11">${values[values.length-1]}kg</text>`;

  svg.innerHTML = `<polyline points="${polyline}" fill="none" stroke="#C9A227" stroke-width="2"/>${circles}${lastLabel}`;
}

async function saveBodyMetric() {
  const payload = {
    date: document.getElementById('metricDate').value || fmt(new Date()),
    weightKg: document.getElementById('metricWeight').value,
    bodyFatPct: document.getElementById('metricBodyFat').value,
    measurements: {
      chest: document.getElementById('metricChest').value,
      waist: document.getElementById('metricWaist').value,
      hip: document.getElementById('metricHip').value,
      arm: document.getElementById('metricArm').value,
      thigh: document.getElementById('metricThigh').value,
      calf: document.getElementById('metricCalf').value,
    },
  };
  try {
    await apiPost('/api/body-metrics', payload);
    showToast('Métrica registrada');
    const metrics = await apiGet('/api/body-metrics');
    renderMetricsTable(metrics);
    renderWeightChart(metrics);
    ['metricWeight', 'metricBodyFat', 'metricChest', 'metricWaist', 'metricHip', 'metricArm', 'metricThigh', 'metricCalf'].forEach(id => {
      document.getElementById(id).value = '';
    });
  } catch (e) { flagSave('erro ao salvar métrica'); }
}

// ---------- Fotos de progresso ----------
function renderProgressGallery(list) {
  const container = document.getElementById('progressGallery');
  container.innerHTML = '';
  if (!list.length) {
    container.innerHTML = '<div class="my-ex-empty">Nenhuma foto de progresso ainda.</div>';
    return;
  }
  list.slice().reverse().forEach(p => {
    const card = document.createElement('div');
    card.className = 'progress-photo-card';
    const img = document.createElement('img');
    img.src = `/api/progress-photos/${p.id}/file`;
    img.alt = p.note || p.date;
    img.onclick = () => openPhotoLightbox(img.src, labelPT(p.date) + (p.note ? ' — ' + p.note : ''));
    const dateEl = document.createElement('div');
    dateEl.className = 'progress-photo-date';
    dateEl.textContent = labelPT(p.date);
    const removeBtn = document.createElement('button');
    removeBtn.className = 'progress-photo-remove';
    removeBtn.textContent = '×';
    removeBtn.onclick = async (e) => {
      e.stopPropagation();
      try {
        await apiDelete(`/api/progress-photos/${p.id}`);
        const list2 = await apiGet('/api/progress-photos');
        renderProgressGallery(list2);
      } catch (err) { flagSave('erro ao remover'); }
    };
    card.appendChild(img);
    card.appendChild(dateEl);
    card.appendChild(removeBtn);
    container.appendChild(card);
  });
}

function bindProgressPhotoInput() {
  document.getElementById('progressPhotoInput').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const date = document.getElementById('progressDate').value || fmt(new Date());
    const note = document.getElementById('progressNote').value || '';
    try {
      await uploadFile('/api/progress-photos', file, { date, note });
      showToast('Foto adicionada');
      const list = await apiGet('/api/progress-photos');
      renderProgressGallery(list);
      document.getElementById('progressNote').value = '';
    } catch (err) { flagSave('erro ao enviar foto'); }
    e.target.value = '';
  };
}

function openPhotoLightbox(src, title) {
  document.getElementById('modalTitle').textContent = title || 'Foto';
  document.getElementById('modalBody').innerHTML = `<img src="${src}" style="width:100%;border-radius:4px;">`;
  document.getElementById('modalOverlay').hidden = false;
}

// ---------- Gamificação ----------
async function loadGamification() {
  let g;
  try { g = await apiGet('/api/gamification'); } catch (e) { return; }
  renderLevelCard(g);
  renderAchievements(g.achievements);
}

function renderLevelCard(g) {
  document.getElementById('levelCard').innerHTML = `
    <div class="level-badge">${g.level}</div>
    <div>
      <div class="level-info-label">Nível</div>
      <div class="level-info-points">${g.points} pontos</div>
    </div>
  `;
}

function renderAchievements(achievements) {
  const grid = document.getElementById('achievementsGrid');
  grid.innerHTML = '';
  achievements.forEach(a => {
    const card = document.createElement('div');
    card.className = 'achievement-card' + (a.unlocked ? ' unlocked' : '');
    card.innerHTML = `<div class="achievement-card-label">${a.unlocked ? '🏆 ' : '🔒 '}${a.label}</div><div class="achievement-card-desc">${a.description}</div>`;
    grid.appendChild(card);
  });
}

function celebrateUnlocks(gam) {
  if (!gam || !gam.newlyUnlocked || !gam.newlyUnlocked.length) return;
  playCelebration();
  gam.newlyUnlocked.forEach((a, i) => {
    setTimeout(() => showToast(`🏆 Conquista: ${a.label}!`), i * 1200);
  });
}

// ---------- Lembretes ----------
const REMINDER_TYPE_LABELS = { treino: 'Treino', refeicao: 'Refeição', agua: 'Água' };
const WEEKDAY_LABELS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
let reminderSelectedDays = new Set([0, 1, 2, 3, 4, 5, 6]);

function buildReminderDaysGrid() {
  const grid = document.getElementById('reminderDaysGrid');
  grid.innerHTML = '';
  WEEKDAY_LABELS.forEach((label, i) => {
    const el = document.createElement('div');
    el.className = 'reminder-day-item' + (reminderSelectedDays.has(i) ? ' selected' : '');
    el.textContent = label;
    el.onclick = () => {
      if (reminderSelectedDays.has(i)) reminderSelectedDays.delete(i);
      else reminderSelectedDays.add(i);
      buildReminderDaysGrid();
    };
    grid.appendChild(el);
  });
}

async function loadReminders() {
  let list = [];
  try { list = await apiGet('/api/reminders'); } catch (e) { list = []; }
  renderRemindersList(list);
}

function renderRemindersList(list) {
  const container = document.getElementById('remindersList');
  container.innerHTML = '';
  if (!list.length) {
    container.innerHTML = '<div class="my-ex-empty">Nenhum lembrete configurado.</div>';
    return;
  }
  list.forEach(r => {
    const row = document.createElement('div');
    row.className = 'reminder-row';
    const info = document.createElement('div');
    info.className = 'reminder-row-info';
    const days = r.daysOfWeek.slice().sort().map(d => WEEKDAY_LABELS[d]).join(' ');
    info.innerHTML = `${REMINDER_TYPE_LABELS[r.type] || r.type} — ${r.time}<div class="reminder-row-days">${days}</div>`;
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'reminder-toggle' + (r.enabled ? ' on' : '');
    toggleBtn.textContent = r.enabled ? '✓ Ativo' : 'Pausado';
    toggleBtn.onclick = async () => {
      try {
        await fetch(`/api/reminders/${r.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: !r.enabled }) });
        await loadReminders();
      } catch (e) { flagSave('erro ao atualizar'); }
    };
    const removeBtn = document.createElement('button');
    removeBtn.className = 'catalog-btn-ghost danger';
    removeBtn.textContent = 'Remover';
    removeBtn.onclick = async () => {
      try { await apiDelete(`/api/reminders/${r.id}`); await loadReminders(); } catch (e) { flagSave('erro ao remover'); }
    };
    row.appendChild(info);
    row.appendChild(toggleBtn);
    row.appendChild(removeBtn);
    container.appendChild(row);
  });
}

async function addReminder() {
  const type = document.getElementById('reminderType').value;
  const time = document.getElementById('reminderTime').value;
  if (!time) { flagSave('informe um horário'); return; }
  try {
    await apiPost('/api/reminders', { type, time, daysOfWeek: Array.from(reminderSelectedDays) });
    showToast('Lembrete adicionado');
    await loadReminders();
  } catch (e) { flagSave('erro ao adicionar lembrete'); }
}

function bindProfileEvents() {
  document.getElementById('profileSaveBtn').onclick = saveProfileTab;
  document.getElementById('metricSaveBtn').onclick = saveBodyMetric;
  document.getElementById('pushToggleBtn').onclick = togglePush;
  document.getElementById('reminderAddBtn').onclick = addReminder;
  buildReminderDaysGrid();
  bindProfilePhotoInput();
  bindProgressPhotoInput();
}

// ---------- Alimentação ----------
const MEAL_LABELS = { cafe: 'Café da manhã', almoco: 'Almoço', lanche: 'Lanche', jantar: 'Jantar' };
const MEAL_ORDER = ['cafe', 'almoco', 'lanche', 'jantar'];
let foodSearchDebounce = null;

function todayKey() { return fmt(new Date()); }

async function loadNutritionTab() {
  await Promise.all([loadNutritionTargets(), loadFoodLog()]);
  document.getElementById('foodSearchResults').innerHTML = '';
  document.getElementById('foodSearchInput').value = '';
}

async function loadNutritionTargets() {
  let targets;
  try { targets = await apiGet('/api/nutrition/targets'); } catch (e) { targets = { kcal: null, proteinG: null, carbG: null, fatG: null, source: 'insuficiente' }; }
  document.getElementById('targetKcal').value = targets.kcal ?? '';
  document.getElementById('targetProtein').value = targets.proteinG ?? '';
  document.getElementById('targetCarb').value = targets.carbG ?? '';
  document.getElementById('targetFat').value = targets.fatG ?? '';

  const hint = document.getElementById('targetSourceHint');
  if (targets.source === 'auto') hint.textContent = 'Calculada automaticamente (objetivo, dias/semana, peso, altura, idade).';
  else if (targets.source === 'manual') hint.textContent = 'Meta definida manualmente.';
  else hint.textContent = 'Preencha peso (Perfil → Métricas), altura e nascimento (Perfil → Dados pessoais) pra calcular automaticamente — ou defina uma meta manual aqui.';

  renderNutritionState(targets);
}

let currentTargets = null;
let currentFoodLog = [];

function renderNutritionState(targets) {
  if (targets) currentTargets = targets;
  renderNutritionSummary(currentTargets, currentFoodLog);
}

async function loadFoodLog() {
  try { currentFoodLog = await apiGet(`/api/food-log/${todayKey()}`); } catch (e) { currentFoodLog = []; }
  renderFoodLogList(currentFoodLog);
  renderNutritionSummary(currentTargets, currentFoodLog);
}

function sumMacro(entries, field) {
  return entries.reduce((acc, e) => {
    if (!e.food) return acc;
    return acc + (e.food[field] || 0) * (e.grams / 100);
  }, 0);
}

function renderNutritionSummary(targets, entries) {
  const el = document.getElementById('nutritionSummary');
  const kcalConsumed = Math.round(sumMacro(entries, 'kcal'));
  const proteinConsumed = Math.round(sumMacro(entries, 'proteinG'));
  const carbConsumed = Math.round(sumMacro(entries, 'carbG'));
  const fatConsumed = Math.round(sumMacro(entries, 'fatG'));

  const kcalTarget = targets && targets.kcal;
  const pct = kcalTarget ? Math.min(100, Math.round((kcalConsumed / kcalTarget) * 100)) : 0;

  function macroBlock(label, value, target, cls) {
    const barPct = target ? Math.min(100, Math.round((value / target) * 100)) : 0;
    return `
      <div class="nutrition-macro">
        <div class="nutrition-macro-label">${label}</div>
        <div class="nutrition-macro-value">${value}g${target ? ' / ' + target + 'g' : ''}</div>
        <div class="nutrition-macro-bar"><div class="nutrition-macro-bar-fill ${cls}" style="width:${barPct}%"></div></div>
      </div>`;
  }

  el.innerHTML = `
    <div class="nutrition-kcal-row">
      <div><span class="nutrition-kcal-num">${kcalConsumed}</span> <span class="nutrition-kcal-label">kcal hoje</span></div>
      <div class="nutrition-kcal-label">${kcalTarget ? 'meta ' + kcalTarget + ' kcal' : 'sem meta definida'}</div>
    </div>
    <div class="nutrition-bar-track"><div class="nutrition-bar-fill" style="width:${pct}%"></div></div>
    <div class="nutrition-macros">
      ${macroBlock('Proteína', proteinConsumed, targets && targets.proteinG, 'protein')}
      ${macroBlock('Carbo', carbConsumed, targets && targets.carbG, 'carb')}
      ${macroBlock('Gordura', fatConsumed, targets && targets.fatG, 'fat')}
    </div>
  `;
}

function renderFoodLogList(entries) {
  const container = document.getElementById('foodLogList');
  container.innerHTML = '';
  if (!entries.length) {
    container.innerHTML = '<div class="my-ex-empty">Nenhum alimento registrado hoje ainda.</div>';
    return;
  }
  MEAL_ORDER.forEach(mealType => {
    const items = entries.filter(e => e.mealType === mealType);
    if (!items.length) return;
    const group = document.createElement('div');
    group.className = 'meal-group';
    const title = document.createElement('div');
    title.className = 'meal-group-title';
    title.textContent = MEAL_LABELS[mealType];
    group.appendChild(title);
    items.forEach(e => {
      const row = document.createElement('div');
      row.className = 'meal-item';
      const name = document.createElement('div');
      name.className = 'food-name';
      const kcal = e.food ? Math.round(e.food.kcal * e.grams / 100) : 0;
      name.textContent = `${e.food ? e.food.name : '(alimento removido)'} — ${e.grams}g`;
      const macro = document.createElement('div');
      macro.className = 'food-macro';
      macro.textContent = `${kcal} kcal`;
      const removeBtn = document.createElement('button');
      removeBtn.className = 'catalog-btn-ghost danger';
      removeBtn.textContent = 'Remover';
      removeBtn.onclick = async () => {
        try {
          await apiDelete(`/api/food-log/${todayKey()}/${e.id}`);
          await loadFoodLog();
        } catch (err) { flagSave('erro ao remover'); }
      };
      row.appendChild(name);
      row.appendChild(macro);
      row.appendChild(removeBtn);
      group.appendChild(row);
    });
    container.appendChild(group);
  });
}

function bindFoodSearch() {
  document.getElementById('foodSearchInput').oninput = (e) => {
    clearTimeout(foodSearchDebounce);
    const q = e.target.value.trim();
    foodSearchDebounce = setTimeout(() => runFoodSearch(q), 250);
  };
}

async function runFoodSearch(q) {
  const container = document.getElementById('foodSearchResults');
  if (!q) { container.innerHTML = ''; return; }
  let results = [];
  try { results = await apiGet('/api/foods/search?q=' + encodeURIComponent(q)); } catch (e) { results = []; }
  container.innerHTML = '';
  if (!results.length) {
    container.innerHTML = '<div class="my-ex-empty">Nada encontrado — cadastre como "meu alimento" abaixo.</div>';
    return;
  }
  results.forEach(food => {
    const row = document.createElement('div');
    row.className = 'food-search-item';
    const name = document.createElement('div');
    name.className = 'food-name';
    name.textContent = food.name;
    const macro = document.createElement('div');
    macro.className = 'food-macro';
    macro.textContent = `${food.kcal} kcal /${food.per}`;
    const gramsInput = document.createElement('input');
    gramsInput.type = 'number';
    gramsInput.placeholder = 'g';
    gramsInput.value = '100';
    const addBtn = document.createElement('button');
    addBtn.className = 'catalog-btn';
    addBtn.textContent = '+ Adicionar';
    addBtn.onclick = async () => {
      const grams = Number(gramsInput.value);
      if (!grams || grams <= 0) { flagSave('informe a quantidade'); return; }
      const mealType = document.getElementById('mealTypeSelect').value;
      try {
        await apiPost(`/api/food-log/${todayKey()}`, { foodKey: food.key, grams, mealType });
        showToast('Adicionado!');
        await loadFoodLog();
      } catch (e) { flagSave('erro ao adicionar'); }
    };
    row.appendChild(name);
    row.appendChild(macro);
    row.appendChild(gramsInput);
    row.appendChild(addBtn);
    container.appendChild(row);
  });
}

async function saveCustomFood() {
  const payload = {
    name: document.getElementById('customFoodName').value,
    kcal: document.getElementById('customFoodKcal').value,
    proteinG: document.getElementById('customFoodProtein').value,
    carbG: document.getElementById('customFoodCarb').value,
    fatG: document.getElementById('customFoodFat').value,
  };
  if (!payload.name.trim()) { flagSave('informe o nome'); return; }
  try {
    await apiPost('/api/foods/custom', payload);
    showToast('Alimento cadastrado! Já dá pra buscar por ele.');
    ['customFoodName', 'customFoodKcal', 'customFoodProtein', 'customFoodCarb', 'customFoodFat'].forEach(id => {
      document.getElementById(id).value = '';
    });
  } catch (e) { flagSave('erro ao cadastrar'); }
}

async function saveManualTargets() {
  const payload = {
    kcal: document.getElementById('targetKcal').value || null,
    proteinG: document.getElementById('targetProtein').value || null,
    carbG: document.getElementById('targetCarb').value || null,
    fatG: document.getElementById('targetFat').value || null,
  };
  try {
    const targets = await apiPut('/api/nutrition/targets', payload);
    showToast('Meta salva');
    renderNutritionState({ ...targets, source: 'manual' });
    document.getElementById('targetSourceHint').textContent = 'Meta definida manualmente.';
  } catch (e) { flagSave('erro ao salvar meta'); }
}

async function resetToAutoTargets() {
  try {
    await apiPut('/api/nutrition/targets', { kcal: null });
    await loadNutritionTargets();
    showToast('Voltou pro cálculo automático');
  } catch (e) { flagSave('erro'); }
}

function bindNutritionEvents() {
  bindFoodSearch();
  document.getElementById('customFoodSaveBtn').onclick = saveCustomFood;
  document.getElementById('targetSaveBtn').onclick = saveManualTargets;
  document.getElementById('targetAutoBtn').onclick = resetToAutoTargets;
}

// ---------- Modal de referência ----------
const POSE_ART = {
  hinge: `<svg viewBox="0 0 120 140" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><circle cx="46" cy="20" r="9"/><line x1="46" y1="29" x2="72" y2="65"/><line x1="72" y1="65" x2="76" y2="120"/><line x1="72" y1="65" x2="52" y2="118"/><line x1="50" y1="40" x2="30" y2="95"/><line x1="30" y1="95" x2="88" y2="95"/><rect x="20" y="88" width="10" height="14"/><rect x="88" y="88" width="10" height="14"/></svg>`,
  squat: `<svg viewBox="0 0 120 140" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><circle cx="60" cy="20" r="9"/><line x1="60" y1="29" x2="60" y2="65"/><line x1="60" y1="35" x2="40" y2="50"/><line x1="40" y1="50" x2="60" y2="55"/><line x1="60" y1="35" x2="80" y2="50"/><line x1="80" y1="50" x2="60" y2="55"/><line x1="60" y1="65" x2="35" y2="95"/><line x1="35" y1="95" x2="35" y2="125"/><line x1="60" y1="65" x2="85" y2="95"/><line x1="85" y1="95" x2="85" y2="125"/><line x1="30" y1="55" x2="90" y2="55"/><rect x="24" y="49" width="8" height="12"/><rect x="88" y="49" width="8" height="12"/></svg>`,
  press: `<svg viewBox="0 0 120 140" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><circle cx="60" cy="20" r="9"/><line x1="60" y1="29" x2="60" y2="80"/><line x1="60" y1="45" x2="40" y2="15"/><line x1="60" y1="45" x2="80" y2="15"/><line x1="60" y1="80" x2="45" y2="125"/><line x1="60" y1="80" x2="75" y2="125"/><line x1="20" y1="15" x2="100" y2="15"/><rect x="14" y="9" width="8" height="12"/><rect x="98" y="9" width="8" height="12"/></svg>`,
  row: `<svg viewBox="0 0 120 140" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><circle cx="46" cy="20" r="9"/><line x1="46" y1="29" x2="72" y2="62"/><line x1="72" y1="62" x2="76" y2="120"/><line x1="72" y1="62" x2="52" y2="118"/><line x1="55" y1="42" x2="30" y2="55"/><line x1="30" y1="55" x2="90" y2="55"/><rect x="22" y="49" width="8" height="12"/><rect x="90" y="49" width="8" height="12"/></svg>`,
  curl: `<svg viewBox="0 0 120 140" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><circle cx="60" cy="20" r="9"/><line x1="60" y1="29" x2="60" y2="85"/><line x1="60" y1="45" x2="40" y2="65"/><line x1="40" y1="65" x2="55" y2="45"/><line x1="60" y1="45" x2="80" y2="65"/><line x1="80" y1="65" x2="65" y2="45"/><line x1="60" y1="85" x2="45" y2="125"/><line x1="60" y1="85" x2="75" y2="125"/><line x1="45" y1="45" x2="75" y2="45"/></svg>`,
  calf: `<svg viewBox="0 0 120 140" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><circle cx="60" cy="20" r="9"/><line x1="60" y1="29" x2="60" y2="75"/><line x1="60" y1="35" x2="40" y2="45"/><line x1="40" y1="45" x2="55" y2="50"/><line x1="60" y1="35" x2="80" y2="45"/><line x1="80" y1="45" x2="65" y2="50"/><line x1="60" y1="75" x2="52" y2="110"/><line x1="52" y1="110" x2="58" y2="122"/><line x1="60" y1="75" x2="68" y2="110"/><line x1="68" y1="110" x2="62" y2="122"/><line x1="30" y1="40" x2="90" y2="40"/></svg>`,
  plank: `<svg viewBox="0 0 140 100" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><circle cx="20" cy="55" r="9"/><line x1="29" y1="55" x2="110" y2="55"/><line x1="30" y1="55" x2="20" y2="80"/><line x1="110" y1="55" x2="122" y2="80"/></svg>`,
  sideplank: `<svg viewBox="0 0 140 100" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><circle cx="20" cy="45" r="9"/><line x1="29" y1="45" x2="110" y2="45"/><line x1="35" y1="45" x2="25" y2="75"/><line x1="105" y1="45" x2="118" y2="70"/><line x1="60" y1="45" x2="60" y2="20"/></svg>`,
  bike: `<svg viewBox="0 0 140 110" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><circle cx="30" cy="90" r="14"/><circle cx="105" cy="90" r="14"/><line x1="30" y1="90" x2="65" y2="55"/><line x1="65" y1="55" x2="105" y2="90"/><line x1="65" y1="55" x2="60" y2="30"/><circle cx="58" cy="24" r="8"/><line x1="65" y1="55" x2="90" y2="55"/></svg>`,
  legpress: `<svg viewBox="0 0 140 120" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><circle cx="30" cy="30" r="9"/><line x1="30" y1="39" x2="55" y2="60"/><line x1="20" y1="70" x2="55" y2="60"/><line x1="55" y1="60" x2="90" y2="60"/><line x1="90" y1="60" x2="70" y2="40"/><line x1="90" y1="60" x2="70" y2="82"/><line x1="112" y1="35" x2="112" y2="85"/><rect x="106" y="30" width="8" height="12"/><rect x="106" y="80" width="8" height="12"/></svg>`,
  pulldown: `<svg viewBox="0 0 120 140" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><circle cx="60" cy="20" r="9"/><line x1="60" y1="29" x2="60" y2="70"/><line x1="60" y1="40" x2="35" y2="55"/><line x1="60" y1="40" x2="85" y2="55"/><line x1="35" y1="55" x2="85" y2="55"/><line x1="60" y1="70" x2="45" y2="110"/><line x1="60" y1="70" x2="75" y2="110"/><line x1="35" y1="55" x2="35" y2="15"/><line x1="85" y1="55" x2="85" y2="15"/></svg>`,
  extension: `<svg viewBox="0 0 140 120" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><circle cx="35" cy="25" r="9"/><line x1="35" y1="34" x2="35" y2="65"/><line x1="35" y1="65" x2="60" y2="65"/><line x1="60" y1="65" x2="60" y2="90"/><line x1="60" y1="65" x2="100" y2="55"/><line x1="35" y1="40" x2="15" y2="55"/></svg>`,
  flexion: `<svg viewBox="0 0 140 100" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><circle cx="20" cy="35" r="9"/><line x1="29" y1="35" x2="90" y2="45"/><line x1="90" y1="45" x2="95" y2="20"/><line x1="90" y1="45" x2="70" y2="20"/><line x1="35" y1="35" x2="25" y2="55"/></svg>`,
  fly: `<svg viewBox="0 0 140 120" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><circle cx="70" cy="20" r="9"/><line x1="70" y1="29" x2="70" y2="75"/><path d="M70 40 Q30 45 20 75"/><path d="M70 40 Q110 45 120 75"/><line x1="70" y1="75" x2="55" y2="115"/><line x1="70" y1="75" x2="85" y2="115"/></svg>`,
  raise: `<svg viewBox="0 0 140 120" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><circle cx="70" cy="20" r="9"/><line x1="70" y1="29" x2="70" y2="80"/><line x1="70" y1="42" x2="20" y2="42"/><line x1="70" y1="42" x2="120" y2="42"/><line x1="70" y1="80" x2="55" y2="115"/><line x1="70" y1="80" x2="85" y2="115"/></svg>`,
  lunge: `<svg viewBox="0 0 140 120" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><circle cx="55" cy="20" r="9"/><line x1="55" y1="29" x2="60" y2="65"/><line x1="60" y1="65" x2="40" y2="90"/><line x1="40" y1="90" x2="40" y2="112"/><line x1="60" y1="65" x2="95" y2="80"/><line x1="95" y1="80" x2="115" y2="110"/></svg>`,
};

function openExerciseModal(ex) {
  document.getElementById('modalTitle').textContent = ex.name;
  const art = POSE_ART[ex.pose] || '';
  const query = encodeURIComponent(ex.name + ' exercício execução');

  const metaBits = [];
  if (ex.muscleGroup) metaBits.push(MUSCLE_LABELS[ex.muscleGroup] || ex.muscleGroup);
  if (ex.equipment) metaBits.push(EQUIP_LABELS[ex.equipment] || ex.equipment);
  const meta = metaBits.length ? `<div class="modal-meta">${metaBits.join(' · ')}</div>` : '';
  const desc = ex.description
    ? `<div class="modal-desc">${ex.description}</div>`
    : `<div style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--text-faint);margin-top:-6px;">Esquema de referência do movimento</div>`;

  document.getElementById('modalBody').innerHTML = `
    ${art}
    ${meta}
    ${desc}
    <a class="modal-photos-link" target="_blank" rel="noopener" href="https://www.google.com/search?tbm=isch&q=${query}">Ver fotos de referência ↗</a>
  `;
  document.getElementById('modalOverlay').hidden = false;
}
function closeModal() { document.getElementById('modalOverlay').hidden = true; }

// ---------- Reset ----------
async function resetAll() {
  if (!confirm('Isso vai apagar todos os registros salvos no servidor. Continuar?')) return;
  await apiDelete('/api/reset');
  location.reload();
}

// ---------- Eventos estáticos ----------
function bindStaticEvents() {
  document.getElementById('completeBtn').onclick = toggleComplete;
  document.getElementById('restBtn').onclick = toggleRest;
  document.getElementById('startSessionBtn').onclick = startSession;
  document.getElementById('cancelSessionBtn').onclick = cancelSession;

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('hoje-view').hidden = btn.dataset.tab !== 'hoje';
      document.getElementById('exercicios-view').hidden = btn.dataset.tab !== 'exercicios';
      document.getElementById('historico-view').hidden = btn.dataset.tab !== 'historico';
      document.getElementById('perfil-view').hidden = btn.dataset.tab !== 'perfil';
      document.getElementById('alimentacao-view').hidden = btn.dataset.tab !== 'alimentacao';
      if (btn.dataset.tab === 'historico') { loadSummary().then(renderCalendar); renderHistory(); }
      if (btn.dataset.tab === 'exercicios') { renderCatalog(); renderMyExLists(); }
      if (btn.dataset.tab === 'hoje') { loadDay(currentDateKey); loadSessionState(); }
      if (btn.dataset.tab === 'perfil') { loadProfileTab(); }
      if (btn.dataset.tab === 'alimentacao') { loadNutritionTab(); }
    };
  });

  document.querySelectorAll('.ex-mode-btn').forEach(btn => {
    btn.onclick = () => switchExMode(btn.dataset.exmode);
  });
  bindSimplificado();
  bindProfileEvents();
  bindNutritionEvents();

  document.getElementById('catalogSearch').oninput = renderCatalog;
  document.getElementById('catalogMuscleFilter').onchange = renderCatalog;
  document.getElementById('catalogEquipFilter').onchange = renderCatalog;
  bindSchedulePanel();

  document.getElementById('histSelect').onchange = renderHistory;
  document.getElementById('resetLink').onclick = resetAll;
  document.getElementById('logoutLink').onclick = logout;
  document.getElementById('modalClose').onclick = closeModal;
  document.getElementById('modalOverlay').onclick = (e) => { if (e.target.id === 'modalOverlay') closeModal(); };
}

// ---------- Carregamento de dia ----------
async function loadSummary() {
  summary = await apiGet('/api/summary');
}

async function loadDay(dateKey) {
  currentDateKey = dateKey;
  currentDay = await apiGet(`/api/day/${dateKey}`);
  renderDay();
}

init();
