const nodemailer = require('nodemailer');

// Só funciona se GMAIL_USER e GMAIL_APP_PASSWORD estiverem configurados como
// variável de ambiente (no Railway: aba Variables). Diferente das chaves
// VAPID, essas SÃO credenciais de uma conta real — nunca embutir no código.
let transporter = null;
let attempted = false;

function getTransporter() {
  if (attempted) return transporter;
  attempted = true;
  const { GMAIL_USER, GMAIL_APP_PASSWORD } = process.env;
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) return null;
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  });
  return transporter;
}

function isConfigured() {
  return !!getTransporter();
}

async function sendMail({ to, subject, text }) {
  const t = getTransporter();
  if (!t) throw new Error('e-mail não configurado no servidor (faltam GMAIL_USER/GMAIL_APP_PASSWORD)');
  await t.sendMail({ from: process.env.GMAIL_USER, to, subject, text });
}

module.exports = { sendMail, isConfigured };
