const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { db, persist } = require('./db');
const mail = require('./mail');

const RESET_TTL_MS = 60 * 60 * 1000; // 1 hora

const COOKIE_NAME = 'td_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function findUserByEmail(email) {
  const normalized = email.trim().toLowerCase();
  return Object.values(db.users).find((u) => u.email === normalized);
}

function cookieFlags(req) {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  return isHttps ? '; Secure' : '';
}

function setSessionCookie(req, res, token) {
  const maxAgeSec = Math.floor(SESSION_TTL_MS / 1000);
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${token}; HttpOnly; Path=/; Max-Age=${maxAgeSec}; SameSite=Lax${cookieFlags(req)}`
  );
}

function clearSessionCookie(req, res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${cookieFlags(req)}`);
}

function publicUser(user) {
  return { id: user.id, email: user.email, name: user.name };
}

async function signup(req, res) {
  const { email, password, name } = req.body || {};
  if (!isValidEmail(email)) return res.status(400).json({ error: 'E-mail inválido' });
  if (typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'A senha precisa ter pelo menos 6 caracteres' });
  }
  if (findUserByEmail(email)) {
    return res.status(409).json({ error: 'Já existe uma conta com esse e-mail' });
  }

  const id = crypto.randomUUID();
  const normalizedEmail = email.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(password, 10);
  db.users[id] = {
    id,
    email: normalizedEmail,
    name: (name || '').trim() || normalizedEmail.split('@')[0],
    passwordHash,
    createdAt: new Date().toISOString(),
  };

  const token = crypto.randomUUID();
  db.sessions[token] = { userId: id, expiresAt: Date.now() + SESSION_TTL_MS };
  await persist();

  setSessionCookie(req, res, token);
  res.json(publicUser(db.users[id]));
}

async function login(req, res) {
  const { email, password } = req.body || {};
  if (!isValidEmail(email) || typeof password !== 'string') {
    return res.status(400).json({ error: 'E-mail ou senha inválidos' });
  }
  const user = findUserByEmail(email);
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: 'E-mail ou senha incorretos' });
  }

  const token = crypto.randomUUID();
  db.sessions[token] = { userId: user.id, expiresAt: Date.now() + SESSION_TTL_MS };
  await persist();

  setSessionCookie(req, res, token);
  res.json(publicUser(user));
}

async function logout(req, res) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (token && db.sessions[token]) {
    delete db.sessions[token];
    await persist();
  }
  clearSessionCookie(req, res);
  res.json({ ok: true });
}

function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  const session = token && db.sessions[token];

  if (!session || session.expiresAt < Date.now()) {
    if (session) { delete db.sessions[token]; persist(); }
    return res.status(401).json({ error: 'Não autenticado' });
  }

  const user = db.users[session.userId];
  if (!user) {
    delete db.sessions[token];
    persist();
    return res.status(401).json({ error: 'Não autenticado' });
  }

  req.userId = user.id;
  req.user = user;
  next();
}

function me(req, res) {
  res.json(publicUser(req.user));
}

// ---------- Recuperação de senha (por e-mail) ----------
async function forgotPassword(req, res) {
  const { email } = req.body || {};
  if (!isValidEmail(email)) return res.status(400).json({ error: 'e-mail inválido' });

  if (!mail.isConfigured()) {
    return res.status(503).json({ error: 'recuperação por e-mail não está configurada neste servidor ainda' });
  }

  const user = findUserByEmail(email);
  // Resposta igual exista ou não a conta — evita confirmar pra quem tenta
  // adivinhar e-mails cadastrados.
  if (!user) return res.json({ ok: true });

  const token = crypto.randomBytes(32).toString('hex');
  db.passwordResets[token] = { userId: user.id, expiresAt: Date.now() + RESET_TTL_MS };
  await persist();

  const origin = `${req.protocol}://${req.get('host')}`;
  const resetUrl = `${origin}/?resetToken=${token}`;

  try {
    await mail.sendMail({
      to: user.email,
      subject: 'Redefinir senha — Diário de Ferro',
      text:
        `Alguém (esperamos que você) pediu pra redefinir a senha da sua conta no Diário de Ferro.\n\n` +
        `Clique no link abaixo pra escolher uma nova senha — ele vale por 1 hora:\n${resetUrl}\n\n` +
        `Se não foi você, pode ignorar este e-mail; sua senha continua a mesma.`,
    });
  } catch (e) {
    console.error('[mail] falha ao enviar e-mail de recuperação:', e && e.code, e && e.message, e);
    return res.status(500).json({ error: 'não consegui enviar o e-mail agora, tenta de novo mais tarde' });
  }

  res.json({ ok: true });
}

async function resetPassword(req, res) {
  const { token, newPassword } = req.body || {};
  const entry = token && db.passwordResets[token];
  if (!entry || entry.expiresAt < Date.now()) {
    if (entry) delete db.passwordResets[token];
    return res.status(400).json({ error: 'link inválido ou expirado — peça a recuperação de novo' });
  }
  if (typeof newPassword !== 'string' || newPassword.length < 6) {
    return res.status(400).json({ error: 'a nova senha precisa ter pelo menos 6 caracteres' });
  }

  const user = db.users[entry.userId];
  if (!user) return res.status(400).json({ error: 'conta não encontrada' });

  user.passwordHash = await bcrypt.hash(newPassword, 10);
  delete db.passwordResets[token];

  const sessionToken = crypto.randomUUID();
  db.sessions[sessionToken] = { userId: user.id, expiresAt: Date.now() + SESSION_TTL_MS };
  await persist();

  setSessionCookie(req, res, sessionToken);
  res.json(publicUser(user));
}

// ---------- Trocar senha (usuário já logado) ----------
async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body || {};
  if (typeof newPassword !== 'string' || newPassword.length < 6) {
    return res.status(400).json({ error: 'a nova senha precisa ter pelo menos 6 caracteres' });
  }
  const ok = await bcrypt.compare(currentPassword || '', req.user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'senha atual incorreta' });

  req.user.passwordHash = await bcrypt.hash(newPassword, 10);
  await persist();
  res.json({ ok: true });
}

module.exports = {
  signup,
  login,
  logout,
  requireAuth,
  me,
  forgotPassword,
  resetPassword,
  changePassword,
  mailConfigured: mail.isConfigured,
};
