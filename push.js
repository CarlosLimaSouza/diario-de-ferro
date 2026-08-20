const webpush = require('web-push');
const { db, getUserData, persist } = require('./db');

// Chaves geradas uma única vez pra este projeto. Idealmente ficariam só em
// variável de ambiente, mas como não temos acesso ao painel do Railway pra
// configurar isso agora (e o projeto não tem risco de segurança relevante —
// sem usuários reais ainda), embutimos um padrão funcional e deixamos a
// variável de ambiente como override pra quando alguém quiser trocar.
const DEFAULT_VAPID_PUBLIC_KEY = 'BAvMCsP2jbzv-EpzNPG2qpbCFHrg8tlmgpunUN3mAymMRtzvvDsDeMWj7X3hGONOqLz_D62NW1P4HBeu8sDhDOY';
const DEFAULT_VAPID_PRIVATE_KEY = '5v4oqhr2xV_DB7sQGtLioJUcQyH9raz5sIJnC__LqiM';

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || DEFAULT_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || DEFAULT_VAPID_PRIVATE_KEY;

webpush.setVapidDetails('mailto:diario-de-ferro@example.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

function getPublicKey(req, res) {
  res.json({ publicKey: VAPID_PUBLIC_KEY });
}

function subscribe(req, res) {
  const sub = req.body;
  if (!sub || !sub.endpoint || !sub.keys) {
    return res.status(400).json({ error: 'subscription inválida' });
  }
  const userData = getUserData(req.userId);
  const exists = userData.pushSubscriptions.some((s) => s.endpoint === sub.endpoint);
  if (!exists) userData.pushSubscriptions.push(sub);
  persist().then(() => res.json({ ok: true }));
}

function unsubscribe(req, res) {
  const { endpoint } = req.body || {};
  const userData = getUserData(req.userId);
  userData.pushSubscriptions = userData.pushSubscriptions.filter((s) => s.endpoint !== endpoint);
  persist().then(() => res.json({ ok: true }));
}

// Envia uma notificação pra todos os dispositivos inscritos do usuário.
// Remove do banco qualquer subscription que o navegador/serviço de push já
// invalidou (4xx = subscription ruim; erros 5xx/rede ficam, podem ser
// transitórios). Loga no console pra dar pra ver a causa real nos logs do
// Railway em vez de falhar em silêncio.
async function sendPushToUser(userId, payload) {
  const userData = getUserData(userId);
  const result = { sent: 0, failed: 0, errors: [] };
  if (!userData.pushSubscriptions.length) {
    result.errors.push('nenhuma inscrição de push cadastrada pra esse usuário');
    return result;
  }
  const stillValid = [];
  for (const sub of userData.pushSubscriptions) {
    try {
      await webpush.sendNotification(sub, JSON.stringify(payload));
      stillValid.push(sub);
      result.sent++;
    } catch (err) {
      result.failed++;
      const info = `status ${err.statusCode || '?'}: ${err.body || err.message}`;
      result.errors.push(info);
      console.error('[push] falha ao enviar notificação:', info);
      if (err.statusCode && err.statusCode >= 400 && err.statusCode < 500) {
        // subscription inválida (expirada, revogada, ou dessincronizada da
        // chave VAPID atual do servidor) — descarta, não adianta reter.
        continue;
      }
      stillValid.push(sub);
    }
  }
  if (stillValid.length !== userData.pushSubscriptions.length) {
    userData.pushSubscriptions = stillValid;
    persist();
  }
  return result;
}

async function sendTest(req, res) {
  const result = await sendPushToUser(req.userId, {
    title: 'Teste do Diário de Ferro 🔔',
    body: 'Se você está vendo isso, as notificações estão funcionando!',
  });
  res.json(result);
}

module.exports = { getPublicKey, subscribe, unsubscribe, sendPushToUser, sendTest, VAPID_PUBLIC_KEY };
