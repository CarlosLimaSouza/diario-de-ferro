// ---------- Estado ----------
let EXERCISES = null;
let ALL_EXERCISES = [];
let currentDateKey = fmt(new Date());
let currentDay = null; // { date, dayType, present, exercises }
let summary = []; // [{date, dayType, present}]
let audioCtx = null;

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

// ---------- Carregamento inicial ----------
async function init() {
  const cfg = await apiGet('/api/config');
  EXERCISES = cfg.exercises;
  ALL_EXERCISES = [...EXERCISES.heavy, ...EXERCISES.light];
  populateHistSelect();
  await loadSummary();
  await loadDay(currentDateKey);
  bindStaticEvents();
}

async function loadSummary() {
  summary = await apiGet('/api/summary');
}

async function loadDay(dateKey) {
  currentDateKey = dateKey;
  currentDay = await apiGet(`/api/day/${dateKey}`);
  renderDay();
}

// ---------- Render: cabeçalho do dia ----------
function renderDay() {
  document.getElementById('dayDateLabel').textContent = labelPT(currentDay.date);
  const badge = document.getElementById('dayTypeBadge');
  badge.textContent = currentDay.dayType === 'heavy' ? 'Dia pesado' : 'Dia leve';
  badge.className = 'day-type-badge ' + currentDay.dayType;

  document.getElementById('setHeavy').className = currentDay.dayType === 'heavy' ? 'sel-heavy' : '';
  document.getElementById('setLight').className = currentDay.dayType === 'light' ? 'sel-light' : '';

  const pbtn = document.getElementById('presenceBtn');
  pbtn.textContent = currentDay.present ? '✓ Presença marcada' : 'Marcar presença de hoje';
  pbtn.className = 'presence-btn' + (currentDay.present ? ' on' : '');

  renderExercises();
  renderCalendar();
  renderStreak();
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

  list.forEach(ex => {
    const entry = currentDay.exercises[ex.key];
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
    await apiPost(`/api/day/${currentDay.date}/exercise/${ex.key}`, { data, completed, value, detail });
    flagSave('salvo');
  } catch (e) {
    flagSave('erro ao salvar');
  }
}

// ---------- Presença ----------
async function togglePresence() {
  const newVal = !currentDay.present;
  currentDay.present = newVal;
  try {
    await apiPost(`/api/day/${currentDay.date}/presence`, { present: newVal });
  } catch (e) { flagSave('erro ao salvar'); return; }

  const idx = summary.findIndex(s => s.date === currentDay.date);
  if (idx >= 0) summary[idx].present = newVal;
  else summary.push({ date: currentDay.date, dayType: currentDay.dayType, present: newVal });

  const pbtn = document.getElementById('presenceBtn');
  pbtn.textContent = newVal ? '✓ Presença marcada' : 'Marcar presença de hoje';
  pbtn.className = 'presence-btn' + (newVal ? ' on' : '');

  if (newVal) {
    pbtn.classList.add('bump');
    setTimeout(() => pbtn.classList.remove('bump'), 150);
    playCelebration();
    showToast('🔥 Presença registrada!');
  }

  renderCalendar();
  renderStreak(true);
}

// ---------- Dia pesado/leve ----------
async function setDayType(newType) {
  if (currentDay.dayType === newType) return;
  try {
    await apiPost(`/api/day/${currentDay.date}/daytype`, { dayType: newType });
  } catch (e) { flagSave('erro ao salvar'); return; }
  await loadDay(currentDay.date);
  const idx = summary.findIndex(s => s.date === currentDay.date);
  if (idx >= 0) summary[idx].dayType = newType;
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
    if (info && info.present) cls += info.dayType === 'heavy' ? ' heavy-on' : ' light-on';
    if (dk === today) cls += ' today';
    if (dk === currentDay.date) cls += ' selected';
    cell.className = cls;
    cell.title = dk;
    cell.onclick = () => loadDay(dk);
    cal.appendChild(cell);
  });
}

// ---------- Streak ----------
function renderStreak(pulse) {
  const byDate = {};
  summary.forEach(s => { byDate[s.date] = s; });
  const today = fmt(new Date());
  let cursor = new Date();
  if (!(byDate[today] && byDate[today].present)) cursor = addDays(cursor, -1);
  let streak = 0;
  while (true) {
    const key = fmt(cursor);
    if (byDate[key] && byDate[key].present) { streak++; cursor = addDays(cursor, -1); }
    else break;
  }
  const el = document.getElementById('streakNum');
  el.textContent = streak;
  if (pulse) { el.classList.add('pulse'); setTimeout(() => el.classList.remove('pulse'), 150); }
}

// ---------- Histórico ----------
function populateHistSelect() {
  const sel = document.getElementById('histSelect');
  sel.innerHTML = '';
  ALL_EXERCISES.forEach(ex => {
    const opt = document.createElement('option');
    opt.value = ex.key;
    opt.textContent = ex.name;
    sel.appendChild(opt);
  });
}

async function renderHistory() {
  const sel = document.getElementById('histSelect');
  const key = sel.value || ALL_EXERCISES[0].key;
  let hist = [];
  try {
    hist = await apiGet(`/api/history/${key}`);
  } catch (e) { hist = []; }

  const svg = document.getElementById('histChart');
  const table = document.getElementById('histTable');

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
  const circles = pts.map(p => `<circle cx="${p.x}" cy="${p.y}" r="3" fill="#C9A227"/>`).join('');
  const lastLabel = pts.length ? `<text x="${pts[pts.length-1].x}" y="${pts[pts.length-1].y - 10}" text-anchor="end" fill="#EDEBE6" font-family="JetBrains Mono" font-size="11">${values[values.length-1]}</text>` : '';

  svg.innerHTML = `<polyline points="${polyline}" fill="none" stroke="#C9A227" stroke-width="2"/>${circles}${lastLabel}`;

  table.innerHTML = `<tr><th>Data</th><th>Valor</th><th>Detalhe</th></tr>` +
    hist.slice().reverse().slice(0, 15).map(pt => `<tr><td>${labelPT(pt.date)}</td><td>${pt.value}</td><td>${pt.detail || ''}</td></tr>`).join('');
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
};

function openExerciseModal(ex) {
  document.getElementById('modalTitle').textContent = ex.name;
  const art = POSE_ART[ex.pose] || '';
  const query = encodeURIComponent(ex.name + ' exercício execução');
  document.getElementById('modalBody').innerHTML = `
    ${art}
    <div style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--text-faint);margin-top:-6px;">Esquema de referência do movimento</div>
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
  document.getElementById('presenceBtn').onclick = togglePresence;
  document.getElementById('setHeavy').onclick = () => setDayType('heavy');
  document.getElementById('setLight').onclick = () => setDayType('light');
  document.getElementById('prevDay').onclick = () => loadDay(fmt(addDays(parseKey(currentDay.date), -1)));
  document.getElementById('nextDay').onclick = () => loadDay(fmt(addDays(parseKey(currentDay.date), 1)));

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('hoje-view').hidden = btn.dataset.tab !== 'hoje';
      document.getElementById('historico-view').hidden = btn.dataset.tab !== 'historico';
      if (btn.dataset.tab === 'historico') renderHistory();
    };
  });

  document.getElementById('histSelect').onchange = renderHistory;
  document.getElementById('resetLink').onclick = resetAll;
  document.getElementById('modalClose').onclick = closeModal;
  document.getElementById('modalOverlay').onclick = (e) => { if (e.target.id === 'modalOverlay') closeModal(); };
}

init();
