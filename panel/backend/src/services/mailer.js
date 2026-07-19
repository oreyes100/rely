import nodemailer from 'nodemailer';
import { config } from '../config.js';

let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;
  if (!config.smtpHost) {
    console.warn('[mailer] SMTP no configurado — los emails no se enviarán');
    return null;
  }
  _transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpPort === 465,
    auth: config.smtpUser ? { user: config.smtpUser, pass: config.smtpPass } : undefined,
  });
  return _transporter;
}

export async function sendInviteEmail({ to, name, inviteCode, panelUrl }) {
  const transporter = getTransporter();
  if (!transporter) {
    console.warn(`[mailer] Email no enviado a ${to} — SMTP no configurado`);
    return false;
  }
  const subject = 'Tu código de acceso al Portal VPS';
  const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:system-ui,sans-serif;color:#e2e8f0">
  <div style="max-width:540px;margin:40px auto;background:#1e293b;border-radius:12px;overflow:hidden;border:1px solid #334155">
    <div style="background:#4f46e5;padding:28px 32px">
      <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700">▦ Portal VPS</h1>
      <p style="margin:6px 0 0;color:#c7d2fe;font-size:14px">Tu plataforma de hosting gestionado</p>
    </div>
    <div style="padding:32px">
      <p style="margin:0 0 16px;font-size:16px">Hola${name ? ', <strong>' + escapeHtml(name) + '</strong>' : ''}:</p>
      <p style="margin:0 0 24px;color:#94a3b8;line-height:1.6">
        Tu cuenta fue creada exitosamente. Usa el código de invitación de abajo para activar tu acceso al Portal VPS, donde podrás desplegar tu sitio web o aplicación en minutos.
      </p>
      <div style="background:#0f172a;border:1px solid #4f46e5;border-radius:8px;padding:20px;text-align:center;margin:0 0 24px">
        <p style="margin:0 0 8px;color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:1px">Tu código de invitación</p>
        <code style="font-size:28px;font-weight:700;color:#a5b4fc;letter-spacing:4px;font-family:monospace">${escapeHtml(inviteCode)}</code>
      </div>
      <a href="${escapeHtml(panelUrl)}" style="display:block;background:#4f46e5;color:#fff;text-decoration:none;text-align:center;padding:14px 24px;border-radius:8px;font-weight:600;font-size:15px;margin:0 0 24px">
        Ir al Portal VPS →
      </a>
      <div style="background:#1e3a5f;border-radius:8px;padding:16px;font-size:13px;color:#93c5fd;line-height:1.6">
        <strong>¿Cómo usarlo?</strong><br>
        1. Abre el enlace de arriba<br>
        2. Haz clic en la pestaña <strong>Cliente</strong> → <strong>Registrarse</strong><br>
        3. Ingresa tu correo, crea una contraseña e introduce este código<br>
        4. ¡Listo! Podrás crear tu primer proyecto en minutos
      </div>
    </div>
    <div style="padding:16px 32px;border-top:1px solid #334155;text-align:center">
      <p style="margin:0;color:#475569;font-size:12px">Este código es de uso único. Si no solicitaste esta cuenta, ignora este correo.</p>
    </div>
  </div>
</body>
</html>`;

  await transporter.sendMail({
    from: `"Portal VPS" <${config.smtpFrom}>`,
    to,
    subject,
    html,
  });
  return true;
}

export async function sendAdminAlert({ subject, body }) {
  const transporter = getTransporter();
  if (!transporter) return false;
  const adminEmail = config.smtpUser; // el admin usa el mismo correo SMTP
  await transporter.sendMail({
    from: `"Portal VPS ALERTA" <${config.smtpFrom}>`,
    to: adminEmail,
    subject,
    text: body,
    html: `<pre style="font-family:monospace;white-space:pre-wrap">${escapeHtml(body)}</pre>`,
  });
  return true;
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
