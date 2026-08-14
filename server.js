const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const { db, persist, getUserData, resetUserData } = require('./db');
const { CATALOG } = require('./catalog');
const { signup, login, logout, requireAuth, me } = require('./auth');

const app = express();
app.set('trust proxy', 1);
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

function dayTypeFor(dateKey) {
  const days = Math.floor(new Date(dateKey + 'T00:00:00').getTime() / 86400000);
  return days % 2 === 0 ? 'heavy' : 'light';
}

function blankData(ex) {
  if (ex.type === 'bike') return { minutes: '', level: '', done: false };
  if (ex.type === 'weight') {
    return { sets: Array.from({ length: ex.sets }, () => ({ weight: '', reps: '', done: false })) };
  }
  return { sets: Array.from({ length: ex.sets }, () => ({ seconds: '', done: false })) };
}

function myExercisesGrouped(userData) {
  const catalogByKey = Object.fromEntries(CATALOG.map((c) => [c.key, c]));
  const grouped = { heavy: [], light: [] };
  userData.myExercises.forEach((entry) => {
    const def = catalogByKey[entry.key];
    if (def && grouped[entry.category]) grouped[entry.category].push(def);
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

// ---------- Meus exercícios ----------
app.get('/api/my-exercises', requireAuth, (req, res) => {
  const userData = getUserData(req.userId);
  res.json(myExercisesGrouped(userData));
});

app.post('/api/my-exercises', requireAuth, (req, res) => {
  const { key, category } = req.body || {};
  if (category !== 'heavy' && category !== 'light') {
    return res.status(400).json({ error: 'category inválida' });
  }
  const def = CATALOG.find((c) => c.key === key);
  if (!def) return res.status(404).json({ error: 'exercício não encontrado no catálogo' });

  const userData = getUserData(req.userId);
  const existing = userData.myExercises.find((m) => m.key === key);
  if (existing) existing.category = category;
  else userData.myExercises.push({ key, category });

  persist().then(() => res.json({ ok: true, myExercises: myExercisesGrouped(userData) }));
});

app.patch('/api/my-exercises/:key', requireAuth, (req, res) => {
  const { category } = req.body || {};
  if (category !== 'heavy' && category !== 'light') {
    return res.status(400).json({ error: 'category inválida' });
  }
  const userData = getUserData(req.userId);
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
app.get('/api/day/:date', requireAuth, (req, res) => {
  const userData = getUserData(req.userId);
  const date = req.params.date;
  const dayEntry = userData.days[date];
  const dayType = (dayEntry && dayEntry.dayType) || dayTypeFor(date);
  const present = !!(dayEntry && dayEntry.present);

  const grouped = myExercisesGrouped(userData);
  const exercises = {};
  grouped[dayType].forEach((ex) => {
    const logKey = `${date}::${ex.key}`;
    const log = userData.exerciseLogs[logKey];
    if (log) {
      exercises[ex.key] = { data: log.data, completed: !!log.completed };
    } else {
      const def = userData.defaults[ex.key];
      exercises[ex.key] = { data: def ? def.data : blankData(ex), completed: false };
    }
  });

  res.json({ date, dayType, present, exercises });
});

app.post('/api/day/:date/presence', requireAuth, (req, res) => {
  const userData = getUserData(req.userId);
  const date = req.params.date;
  const present = !!req.body.present;
  const existing = userData.days[date] || { dayType: dayTypeFor(date) };
  userData.days[date] = { ...existing, present };
  persist().then(() => res.json({ ok: true, date, present }));
});

app.post('/api/day/:date/daytype', requireAuth, (req, res) => {
  const userData = getUserData(req.userId);
  const date = req.params.date;
  const { dayType } = req.body;
  if (dayType !== 'heavy' && dayType !== 'light') {
    return res.status(400).json({ error: 'dayType inválido' });
  }
  const existing = userData.days[date] || { present: false };
  userData.days[date] = { ...existing, dayType };
  persist().then(() => res.json({ ok: true, date, dayType }));
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

  if (!userData.days[date]) {
    userData.days[date] = { dayType: dayTypeFor(date), present: false };
  }

  persist().then(() => res.json({ ok: true }));
});

app.get('/api/summary', requireAuth, (req, res) => {
  const userData = getUserData(req.userId);
  const out = Object.entries(userData.days).map(([date, v]) => ({
    date,
    dayType: v.dayType,
    present: !!v.present,
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

app.get('/api/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Diário de Ferro rodando na porta ${PORT}`));
