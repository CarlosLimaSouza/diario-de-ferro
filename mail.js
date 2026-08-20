const nodemailer = require('nodemailer');

// Duas formas de enviar e-mail, nessa ordem de preferência:
//
// 1) Resend (RESEND_API_KEY) — API HTTP simples (porta 443), não depende de
//    porta SMTP liberada na rede do host. Sem domínio verificado no Resend,
//    só entrega pro e-mail da própria conta Resend (dá pra usar assim por
//    enquanto, já que quem usa o app é só o dono da conta).
// 2) Gmail via SMTP (GMAIL_USER/GMAIL_APP_PASSWORD) — porta 587 com STARTTLS
//    em vez do atalho "service: gmail" (que usa 465 direto); alguns hosts
//    bloqueiam 465 mas liberam 587. Ainda assim depende de porta SMTP
//    liberada na rede — é o motivo mais provável se isso continuar falhando.
//
// Nenhuma dessas credenciais é embutida no código — só variável de ambiente.

let smtpTransporter = null;
let smtpAttempted = false;

function getSmtpTransporter() {
  if (smtpAttempted) return smtpTransporter;
  smtpAttempted = true;
  const { GMAIL_USER, GMAIL_APP_PASSWORD } = process.env;
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) return null;
  smtpTransporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, // STARTTLS, não TLS implícito
    requireTLS: true,
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  });
  return smtpTransporter;
}

function activeMethod() {
  if (process.env.RESEND_API_KEY) return 'resend';
  if (getSmtpTransporter()) return 'smtp';
  return null;
}

function isConfigured() {
  return !!activeMethod();
}

async function sendViaResend({ to, subject, text }) {
  const from = process.env.RESEND_FROM || 'onboarding@resend.dev';
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, text }),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`Resend respondeu ${r.status}: ${body}`);
  }
}

async function sendMail({ to, subject, text }) {
  const method = activeMethod();
  if (method === 'resend') {
    return sendViaResend({ to, subject, text });
  }
  if (method === 'smtp') {
    await smtpTransporter.sendMail({ from: process.env.GMAIL_USER, to, subject, text });
    return;
  }
  throw new Error('e-mail não configurado no servidor (faltam RESEND_API_KEY ou GMAIL_USER/GMAIL_APP_PASSWORD)');
}

module.exports = { sendMail, isConfigured };
