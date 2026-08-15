const crypto = require('crypto');
const { db, getUserData, persist } = require('./db');
const { sendPushToUser } = require('./push');

const TYPES = ['treino', 'refeicao', 'agua'];
const TYPE_MESSAGES = {
  treino: { title: 'Hora de treinar 💪', body: 'Bora bater o treino de hoje.' },
  refeicao: { title: 'Hora de comer 🍽️', body: 'Não esquece de registrar no diário alimentar.' },
  agua: { title: 'Hora de beber água 💧', body: 'Uma pausa rápida pra se hidratar.' },
};

function list(req, res) {
  res.json(getUserData(req.userId).reminders);
}

function create(req, res) {
  const { type, time, daysOfWeek } = req.body || {};
  if (!TYPES.includes(type)) return res.status(400).json({ error: 'tipo inválido' });
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return res.status(400).json({ error: 'horário inválido' });

  const userData = getUserData(req.userId);
  const reminder = {
    id: crypto.randomUUID(),
    type,
    time,
    daysOfWeek: Array.isArray(daysOfWeek) && daysOfWeek.length ? daysOfWeek.filter((d) => d >= 0 && d <= 6) : [0, 1, 2, 3, 4, 5, 6],
    enabled: true,
    lastFiredDate: null,
  };
  userData.reminders.push(reminder);
  persist().then(() => res.json(reminder));
}

function update(req, res) {
  const userData = getUserData(req.userId);
  const r = userData.reminders.find((x) => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: 'lembrete não encontrado' });
  if (typeof req.body.enabled === 'boolean') r.enabled = req.body.enabled;
  if (typeof req.body.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(req.body.time)) r.time = req.body.time;
  if (Array.isArray(req.body.daysOfWeek)) r.daysOfWeek = req.body.daysOfWeek.filter((d) => d >= 0 && d <= 6);
  persist().then(() => res.json(r));
}

function remove(req, res) {
  const userData = getUserData(req.userId);
  userData.reminders = userData.reminders.filter((x) => x.id !== req.params.id);
  persist().then(() => res.json({ ok: true }));
}

// Roda a cada minuto (fuso do servidor — ajuste por usuário fica pra depois
// se fizer falta). Dispara no máximo uma vez por lembrete por dia.
function tick() {
  const now = new Date();
  const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const dow = now.getDay();
  let changed = false;

  Object.entries(db.userData).forEach(([userId, userData]) => {
    (userData.reminders || []).forEach((r) => {
      if (!r.enabled || r.time !== nowTime || !r.daysOfWeek.includes(dow) || r.lastFiredDate === today) return;
      r.lastFiredDate = today;
      changed = true;
      const msg = TYPE_MESSAGES[r.type] || { title: 'Diário de Ferro', body: 'Lembrete' };
      sendPushToUser(userId, msg);
    });
  });

  if (changed) persist();
}

function startScheduler() {
  setInterval(tick, 60 * 1000);
}

module.exports = { list, create, update, remove, startScheduler };
