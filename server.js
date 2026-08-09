const express = require('express');
const path = require('path');
const { db, persist, resetDB } = require('./db');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const EXERCISES = {
  heavy: [
    { key: 'terra', name: 'Levantamento terra', type: 'weight', sets: 4, pose: 'hinge' },
    { key: 'agacha_frontal', name: 'Agachamento frontal', type: 'weight', sets: 4, pose: 'squat' },
    { key: 'militar', name: 'Desenvolvimento militar', type: 'weight', sets: 4, pose: 'press' },
    { key: 'remada_curvada', name: 'Remada curvada', type: 'weight', sets: 4, pose: 'row' },
    { key: 'prancha', name: 'Prancha', type: 'time', sets: 3, pose: 'plank' },
  ],
  light: [
    { key: 'agacha_leve', name: 'Agachamento (leve)', type: 'weight', sets: 3, pose: 'squat' },
    { key: 'rosca', name: 'Rosca direta', type: 'weight', sets: 3, pose: 'curl' },
    { key: 'remada_leve', name: 'Remada (leve)', type: 'weight', sets: 3, pose: 'row' },
    { key: 'panturrilha', name: 'Panturrilha com barra', type: 'weight', sets: 3, pose: 'calf' },
    { key: 'bike', name: 'Bicicleta (intervalos)', type: 'bike', sets: 1, pose: 'bike' },
    { key: 'prancha_lateral', name: 'Prancha lateral', type: 'time', sets: 3, note: 'cada lado', pose: 'sideplank' },
  ],
};
const ALL_EXERCISES = [...EXERCISES.heavy, ...EXERCISES.light];

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

app.get('/api/config', (req, res) => {
  res.json({ exercises: EXERCISES });
});

app.get('/api/day/:date', (req, res) => {
  const date = req.params.date;
  const dayEntry = db.days[date];
  const dayType = (dayEntry && dayEntry.dayType) || dayTypeFor(date);
  const present = !!(dayEntry && dayEntry.present);

  const exercises = {};
  EXERCISES[dayType].forEach((ex) => {
    const logKey = `${date}::${ex.key}`;
    const log = db.exerciseLogs[logKey];
    if (log) {
      exercises[ex.key] = { data: log.data, completed: !!log.completed };
    } else {
      const def = db.defaults[ex.key];
      exercises[ex.key] = { data: def ? def.data : blankData(ex), completed: false };
    }
  });

  res.json({ date, dayType, present, exercises });
});

app.post('/api/day/:date/presence', (req, res) => {
  const date = req.params.date;
  const present = !!req.body.present;
  const existing = db.days[date] || { dayType: dayTypeFor(date) };
  db.days[date] = { ...existing, present };
  persist().then(() => res.json({ ok: true, date, present }));
});

app.post('/api/day/:date/daytype', (req, res) => {
  const date = req.params.date;
  const { dayType } = req.body;
  if (dayType !== 'heavy' && dayType !== 'light') {
    return res.status(400).json({ error: 'dayType inválido' });
  }
  const existing = db.days[date] || { present: false };
  db.days[date] = { ...existing, dayType };
  persist().then(() => res.json({ ok: true, date, dayType }));
});

app.post('/api/day/:date/exercise/:key', (req, res) => {
  const { date, key } = req.params;
  const ex = ALL_EXERCISES.find((e) => e.key === key);
  if (!ex) return res.status(404).json({ error: 'exercício não encontrado' });

  const { data, completed, value, detail } = req.body;

  const logKey = `${date}::${key}`;
  db.exerciseLogs[logKey] = {
    data,
    completed: !!completed,
    value: typeof value === 'number' && !isNaN(value) ? value : null,
    detail: detail || '',
  };
  // Vira o novo padrão sugerido pra próxima vez que esse exercício aparecer.
  db.defaults[key] = { data };

  if (!db.days[date]) {
    db.days[date] = { dayType: dayTypeFor(date), present: false };
  }

  persist().then(() => res.json({ ok: true }));
});

app.get('/api/summary', (req, res) => {
  const out = Object.entries(db.days).map(([date, v]) => ({
    date,
    dayType: v.dayType,
    present: !!v.present,
  }));
  out.sort((a, b) => a.date.localeCompare(b.date));
  res.json(out);
});

app.get('/api/history/:key', (req, res) => {
  const key = req.params.key;
  const suffix = `::${key}`;
  const rows = Object.entries(db.exerciseLogs)
    .filter(([k]) => k.endsWith(suffix))
    .map(([k, v]) => ({ date: k.split('::')[0], value: v.value, detail: v.detail }))
    .filter((r) => r.value !== null && r.value !== undefined && !isNaN(r.value));
  rows.sort((a, b) => a.date.localeCompare(b.date));
  res.json(rows.slice(-100));
});

app.delete('/api/reset', (req, res) => {
  resetDB().then(() => res.json({ ok: true }));
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Diário de Ferro rodando na porta ${PORT}`));
