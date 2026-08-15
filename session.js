const { db, getUserData, persist } = require('./db');
const { sendPushToUser } = require('./push');

// setTimeout em memória: funciona bem numa instância única (o caso do
// Railway aqui), mas se o processo reiniciar no meio de um descanso o timer
// se perde — por isso o rearmScheduledPushes() abaixo, chamado no boot,
// revarre quem tinha um descanso pendente e reagenda o que ainda não disparou.
function scheduleRestPush(userId, restEndsAt) {
  const delay = restEndsAt - Date.now();
  if (delay <= 0) return;
  setTimeout(() => {
    const userData = getUserData(userId);
    // só dispara se ainda for o mesmo descanso (evita push atrasado de uma
    // sessão que já foi cancelada/concluída/reiniciada nesse meio tempo)
    if (userData.activeSession.restEndsAt === restEndsAt) {
      sendPushToUser(userId, {
        title: 'Descanso terminado 💪',
        body: 'Hora da próxima série.',
      });
    }
  }, delay);
}

function rearmScheduledPushes() {
  Object.entries(db.userData).forEach(([userId, userData]) => {
    const restEndsAt = userData.activeSession && userData.activeSession.restEndsAt;
    if (restEndsAt && restEndsAt > Date.now()) {
      scheduleRestPush(userId, restEndsAt);
    }
  });
}

function getState(req, res) {
  res.json(getUserData(req.userId).activeSession);
}

function start(req, res) {
  const userData = getUserData(req.userId);
  userData.activeSession = { startedAt: Date.now(), restEndsAt: null };
  persist().then(() => res.json(userData.activeSession));
}

function cancel(req, res) {
  const userData = getUserData(req.userId);
  userData.activeSession = { startedAt: null, restEndsAt: null };
  persist().then(() => res.json({ ok: true }));
}

function rest(req, res) {
  const userData = getUserData(req.userId);
  if (!userData.activeSession.startedAt) {
    return res.status(400).json({ error: 'nenhum treino em andamento' });
  }
  const seconds = Number(req.body && req.body.seconds) || userData.profile.restSeconds || 90;
  const restEndsAt = Date.now() + seconds * 1000;
  userData.activeSession.restEndsAt = restEndsAt;
  scheduleRestPush(req.userId, restEndsAt);
  persist().then(() => res.json(userData.activeSession));
}

module.exports = { getState, start, cancel, rest, rearmScheduledPushes };
