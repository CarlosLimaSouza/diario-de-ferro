const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const crypto = require('crypto');
const { db, persist, getUserData, resetUserData } = require('./db');
const { CATALOG, EQUIPMENT_KEYS } = require('./catalog');
const { signup, login, logout, requireAuth, me } = require('./auth');
const { generatePlan } = require('./plan');
const photos = require('./photos');

const GOALS = ['emagrecimento', 'hipertrofia', 'forca', 'condicionamento', 'saude_geral'];
const LEVELS = ['iniciante', 'intermediario', 'avancado'];
const SEXES = ['M', 'F', 'outro'];

const app = express();
app.set('trust proxy', 1);
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

function blankData(ex) {
  if (ex.type === 'bike') return { minutes: '', level: '', done: false };
  if (ex.type === 'weight') {
    return { sets: Array.from({ length: ex.sets }, () => ({ weight: '', reps: '', done: false })) };
  }
  return { sets: Array.from({ length: ex.sets }, () => ({ seconds: '', done: false })) };
}

function myExercisesGrouped(userData) {
  const catalogByKey = Object.fromEntries(CATALOG.map((c) => [c.key, c]));
  const groupKeys = userData.schedule.groups.map((g) => g.key);
  const grouped = {};
  groupKeys.forEach((k) => { grouped[k] = []; });
  grouped.unassigned = [];
  userData.myExercises.forEach((entry) => {
    const def = catalogByKey[entry.key];
    if (!def) return;
    if (grouped[entry.category]) grouped[entry.category].push(def);
    else grouped.unassigned.push(def);
  });
  return grouped;
}

// ---------- Auth ----------
app.post('/api/auth/signup', signup);
app.post('/api/auth/login', login);
app.post('/api/auth/logout', logout);
app.get('/api/auth/me', requireAuth, me);

// ---------- Catálogo ----------
app.get('/api/catalog', requireAuth, (req, res) => {
  res.json(CATALOG);
});

// ---------- Perfil ----------
app.get('/api/profile', requireAuth, (req, res) => {
  res.json(getUserData(req.userId).profile);
});

app.put('/api/profile', requireAuth, (req, res) => {
  const { sex, goal, daysPerWeek, equipment, level, birthDate, heightCm, restSeconds } = req.body || {};
  const userData = getUserData(req.userId);

  if (sex !== undefined) userData.profile.sex = SEXES.includes(sex) ? sex : null;
  if (goal !== undefined) userData.profile.goal = GOALS.includes(goal) ? goal : null;
  if (level !== undefined) userData.profile.level = LEVELS.includes(level) ? level : null;
  if (daysPerWeek !== undefined) {
    const n = Number(daysPerWeek);
    userData.profile.daysPerWeek = Number.isInteger(n) && n >= 1 && n <= 6 ? n : null;
  }
  if (equipment !== undefined) {
    userData.profile.equipment = Array.isArray(equipment)
      ? equipment.filter((e) => EQUIPMENT_KEYS.includes(e))
      : [];
  }
  if (birthDate !== undefined) {
    userData.profile.birthDate = /^\d{4}-\d{2}-\d{2}$/.test(birthDate) ? birthDate : null;
  }
  if (heightCm !== undefined) {
    const n = Number(heightCm);
    userData.profile.heightCm = Number.isFinite(n) && n >= 100 && n <= 250 ? n : null;
  }
  if (restSeconds !== undefined) {
    const n = Number(restSeconds);
    userData.profile.restSeconds = Number.isFinite(n) && n >= 10 && n <= 600 ? n : 90;
  }

  persist().then(() => res.json(userData.profile));
});

// ---------- Métricas corporais ----------
app.get('/api/body-metrics', requireAuth, (req, res) => {
  res.json(getUserData(req.userId).bodyMetrics);
});

app.post('/api/body-metrics', requireAuth, (req, res) => {
  const { date, weightKg, bodyFatPct, measurements } = req.body || {};
  const userData = getUserData(req.userId);

  const entry = {
    id: crypto.randomUUID(),
    date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : new Date().toISOString().slice(0, 10),
    weightKg: Number.isFinite(Number(weightKg)) && weightKg !== '' ? Number(weightKg) : null,
    bodyFatPct: Number.isFinite(Number(bodyFatPct)) && bodyFatPct !== '' ? Number(bodyFatPct) : null,
    measurements: {},
  };
  const measureKeys = ['chest', 'waist', 'hip', 'arm', 'thigh', 'calf'];
  measureKeys.forEach((k) => {
    const v = measurements && measurements[k];
    entry.measurements[k] = Number.isFinite(Number(v)) && v !== '' ? Number(v) : null;
  });

  userData.bodyMetrics.push(entry);
  userData.bodyMetrics.sort((a, b) => a.date.localeCompare(b.date));
  persist().then(() => res.json(entry));
});

app.delete('/api/body-metrics/:id', requireAuth, (req, res) => {
  const userData = getUserData(req.userId);
  userData.bodyMetrics = userData.bodyMetrics.filter((m) => m.id !== req.params.id);
  persist().then(() => res.json({ ok: true }));
});

// ---------- Fotos (perfil + progresso) ----------
app.post('/api/profile/photo', requireAuth, photos.upload.single('photo'), photos.uploadProfilePhoto);
app.get('/api/profile/photo', requireAuth, photos.getProfilePhoto);
app.post('/api/progress-photos', requireAuth, photos.upload.single('photo'), photos.uploadProgressPhoto);
app.get('/api/progress-photos', requireAuth, photos.listProgressPhotos);
app.get('/api/progress-photos/:id/file', requireAuth, photos.getProgressPhotoFile);
app.delete('/api/progress-photos/:id', requireAuth, photos.deleteProgressPhoto);

// ---------- Plano sugerido (modo Simplificado) ----------
// Seleção baseada em regras sobre o catálogo existente — não é geração por IA.
app.post('/api/plan/generate', requireAuth, (req, res) => {
  const { goal, daysPerWeek, equipment, level } = req.body || {};
  const groups = generatePlan({ goal, daysPerWeek, equipment, level });
  const catalogByKey = Object.fromEntries(CATALOG.map((c) => [c.key, c]));
  const preview = groups.map((g) => ({
    label: g.label,
    exercises: g.exerciseKeys.map((k) => catalogByKey[k]).filter(Boolean),
  }));
  res.json({ groups: preview });
});

app.post('/api/plan/apply', requireAuth, (req, res) => {
  const { groups } = req.body || {};
  if (!Array.isArray(groups) || groups.length < 1 || groups.length > 5) {
    return res.status(400).json({ error: 'plano inválido' });
  }

  const cleanGroups = groups.map((g, i) => ({
    label: String((g && g.label) || `Treino ${i + 1}`).trim() || `Treino ${i + 1}`,
    exerciseKeys: Array.isArray(g && g.exerciseKeys)
      ? g.exerciseKeys.filter((k) => CATALOG.some((c) => c.key === k))
      : [],
  }));

  const userData = getUserData(req.userId);
  const newGroups = cleanGroups.map((g, i) => ({ key: `g${Date.now()}_${i}`, label: g.label }));
  const newMyExercises = [];
  cleanGroups.forEach((g, i) => {
    g.exerciseKeys.forEach((key) => newMyExercises.push({ key, category: newGroups[i].key }));
  });

  userData.schedule = { groups: newGroups };
  userData.scheduleState = { pendingIndex: 0 };
  userData.myExercises = newMyExercises;

  persist().then(() => res.json({ ok: true }));
});

// ---------- Cronograma ----------
app.get('/api/schedule', requireAuth, (req, res) => {
  const userData = getUserData(req.userId);
  res.json(userData.schedule);
});

app.put('/api/schedule', requireAuth, (req, res) => {
  const { labels } = req.body || {};
  if (!Array.isArray(labels) || labels.length < 1 || labels.length > 5) {
    return res.status(400).json({ error: 'informe de 1 a 5 grupos' });
  }
  const cleanLabels = labels.map((l) => String(l || '').trim()).filter(Boolean);
  if (cleanLabels.length !== labels.length) {
    return res.status(400).json({ error: 'todos os grupos precisam de um nome' });
  }

  const userData = getUserData(req.userId);
  const oldGroups = userData.schedule.groups;
  userData.schedule.groups = cleanLabels.map((label, i) => ({
    key: oldGroups[i] ? oldGroups[i].key : `g${Date.now()}_${i}`,
    label,
  }));
  if (userData.scheduleState.pendingIndex >= userData.schedule.groups.length) {
    userData.scheduleState.pendingIndex = 0;
  }

  persist().then(() => res.json(userData.schedule));
});

// ---------- Meus exercícios ----------
app.get('/api/my-exercises', requireAuth, (req, res) => {
  const userData = getUserData(req.userId);
  res.json(myExercisesGrouped(userData));
});

app.post('/api/my-exercises', requireAuth, (req, res) => {
  const { key, category } = req.body || {};
  const userData = getUserData(req.userId);
  const validKeys = userData.schedule.groups.map((g) => g.key);
  if (!validKeys.includes(category)) {
    return res.status(400).json({ error: 'grupo inválido' });
  }
  const def = CATALOG.find((c) => c.key === key);
  if (!def) return res.status(404).json({ error: 'exercício não encontrado no catálogo' });

  const existing = userData.myExercises.find((m) => m.key === key);
  if (existing) existing.category = category;
  else userData.myExercises.push({ key, category });

  persist().then(() => res.json({ ok: true, myExercises: myExercisesGrouped(userData) }));
});

app.patch('/api/my-exercises/:key', requireAuth, (req, res) => {
  const { category } = req.body || {};
  const userData = getUserData(req.userId);
  const validKeys = userData.schedule.groups.map((g) => g.key);
  if (!validKeys.includes(category)) {
    return res.status(400).json({ error: 'grupo inválido' });
  }
  const entry = userData.myExercises.find((m) => m.key === req.params.key);
  if (!entry) return res.status(404).json({ error: 'exercício não está no seu plano' });
  entry.category = category;
  persist().then(() => res.json({ ok: true, myExercises: myExercisesGrouped(userData) }));
});

app.delete('/api/my-exercises/:key', requireAuth, (req, res) => {
  const userData = getUserData(req.userId);
  userData.myExercises = userData.myExercises.filter((m) => m.key !== req.params.key);
  persist().then(() => res.json({ ok: true, myExercises: myExercisesGrouped(userData) }));
});

// ---------- Dia ----------
// O treino "de hoje" não é mais calculado por rotação de data: é sempre o
// grupo pendente na fila (scheduleState.pendingIndex). A fila só anda quando
// o treino é concluído (POST .../complete) — folga ou um dia em branco não
// avançam. A data continua vindo do cliente (fmt(new Date()) local) só pra
// indexar exerciseLogs/days corretamente no fuso do usuário.
app.get('/api/day/:date', requireAuth, (req, res) => {
  const userData = getUserData(req.userId);
  const date = req.params.date;
  const dayEntry = userData.days[date];
  const pendingGroup = userData.schedule.groups[userData.scheduleState.pendingIndex];

  const status = dayEntry ? dayEntry.status : null;
  // Se hoje já foi concluído, mostra o grupo que foi treinado (visão
  // congelada do dia) em vez do próximo pendente — senão pareceria que dá
  // pra treinar dois grupos no mesmo dia.
  const dayType = status === 'trained' ? dayEntry.groupKey : pendingGroup.key;

  const grouped = myExercisesGrouped(userData);
  const exercises = {};
  (grouped[dayType] || []).forEach((ex) => {
    const logKey = `${date}::${ex.key}`;
    const log = userData.exerciseLogs[logKey];
    if (log) {
      exercises[ex.key] = { data: log.data, completed: !!log.completed };
    } else {
      const def = userData.defaults[ex.key];
      exercises[ex.key] = { data: def ? def.data : blankData(ex), completed: false };
    }
  });

  res.json({ date, dayType, status, exercises });
});

app.post('/api/day/:date/complete', requireAuth, (req, res) => {
  const userData = getUserData(req.userId);
  const date = req.params.date;
  const pendingGroup = userData.schedule.groups[userData.scheduleState.pendingIndex];
  userData.days[date] = { status: 'trained', groupKey: pendingGroup.key };
  userData.scheduleState.pendingIndex =
    (userData.scheduleState.pendingIndex + 1) % userData.schedule.groups.length;
  persist().then(() => res.json({ ok: true }));
});

app.post('/api/day/:date/uncomplete', requireAuth, (req, res) => {
  const userData = getUserData(req.userId);
  const date = req.params.date;
  const dayEntry = userData.days[date];
  if (!dayEntry || dayEntry.status !== 'trained') {
    return res.status(400).json({ error: 'este dia não está marcado como concluído' });
  }
  delete userData.days[date];
  const len = userData.schedule.groups.length;
  userData.scheduleState.pendingIndex = (userData.scheduleState.pendingIndex - 1 + len) % len;
  persist().then(() => res.json({ ok: true }));
});

app.post('/api/day/:date/rest', requireAuth, (req, res) => {
  const userData = getUserData(req.userId);
  const date = req.params.date;
  userData.days[date] = { status: 'rest' };
  persist().then(() => res.json({ ok: true }));
});

app.post('/api/day/:date/unrest', requireAuth, (req, res) => {
  const userData = getUserData(req.userId);
  const date = req.params.date;
  const dayEntry = userData.days[date];
  if (!dayEntry || dayEntry.status !== 'rest') {
    return res.status(400).json({ error: 'este dia não está marcado como folga' });
  }
  delete userData.days[date];
  persist().then(() => res.json({ ok: true }));
});

app.post('/api/day/:date/override', requireAuth, (req, res) => {
  const userData = getUserData(req.userId);
  const { groupKey } = req.body || {};
  const idx = userData.schedule.groups.findIndex((g) => g.key === groupKey);
  if (idx < 0) return res.status(400).json({ error: 'grupo inválido' });
  userData.scheduleState.pendingIndex = idx;
  persist().then(() => res.json({ ok: true }));
});

app.post('/api/day/:date/exercise/:key', requireAuth, (req, res) => {
  const userData = getUserData(req.userId);
  const { date, key } = req.params;
  const imported = userData.myExercises.find((m) => m.key === key);
  const def = CATALOG.find((c) => c.key === key);
  if (!imported || !def) return res.status(404).json({ error: 'exercício não encontrado no seu plano' });

  const { data, completed, value, detail } = req.body;

  const logKey = `${date}::${key}`;
  userData.exerciseLogs[logKey] = {
    data,
    completed: !!completed,
    value: typeof value === 'number' && !isNaN(value) ? value : null,
    detail: detail || '',
  };
  // Vira o novo padrão sugerido pra próxima vez que esse exercício aparecer.
  userData.defaults[key] = { data };

  persist().then(() => res.json({ ok: true }));
});

app.get('/api/summary', requireAuth, (req, res) => {
  const userData = getUserData(req.userId);
  const out = Object.entries(userData.days).map(([date, v]) => ({
    date,
    status: v.status,
    groupKey: v.groupKey || null,
  }));
  out.sort((a, b) => a.date.localeCompare(b.date));
  res.json(out);
});

app.get('/api/history/:key', requireAuth, (req, res) => {
  const userData = getUserData(req.userId);
  const key = req.params.key;
  const suffix = `::${key}`;
  const rows = Object.entries(userData.exerciseLogs)
    .filter(([k]) => k.endsWith(suffix))
    .map(([k, v]) => ({ date: k.split('::')[0], value: v.value, detail: v.detail }))
    .filter((r) => r.value !== null && r.value !== undefined && !isNaN(r.value));
  rows.sort((a, b) => a.date.localeCompare(b.date));
  res.json(rows.slice(-100));
});

app.delete('/api/reset', requireAuth, (req, res) => {
  resetUserData(req.userId).then(() => res.json({ ok: true }));
});

app.get('/favicon.ico', (req, res) => res.status(204).end());

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Erros de upload (multer: arquivo grande demais, tipo inválido) viram JSON
// em vez da página de erro HTML padrão do Express.
app.use((err, req, res, next) => {
  if (err) {
    return res.status(400).json({ error: err.message || 'requisição inválida' });
  }
  next();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Diário de Ferro rodando na porta ${PORT}`));
