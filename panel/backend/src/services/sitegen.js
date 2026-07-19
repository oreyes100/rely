import { writeFileSync } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createWriteStream } from 'fs';
import { config } from '../config.js';

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function hexToRgb(hex) {
  const m = hex.replace('#', '').match(/.{2}/g);
  return m ? m.map((x) => parseInt(x, 16)).join(', ') : '99, 102, 241';
}

export function generateLandingHtml(fields) {
  const { negocio, descripcion, color = '#6366f1', whatsapp, email, secciones = [] } = fields;
  const rgb = hexToRgb(color);

  const seccionesHtml = secciones
    .filter((s) => s.titulo || s.texto)
    .map(
      (s) => `
    <div class="card">
      <h3>${esc(s.titulo)}</h3>
      <p>${esc(s.texto)}</p>
    </div>`
    )
    .join('\n');

  const waLink = whatsapp ? whatsapp.replace(/\D/g, '') : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(negocio)}</title>
<style>
  :root { --c: ${rgb}; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, sans-serif; background: #f8fafc; color: #1e293b; }
  header { background: rgb(var(--c)); color: #fff; padding: 4rem 1.5rem 3rem; text-align: center; }
  header h1 { font-size: 2.5rem; font-weight: 800; margin-bottom: .75rem; }
  header p { font-size: 1.15rem; opacity: .92; max-width: 600px; margin: 0 auto; }
  .cta { margin-top: 2rem; display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap; }
  .btn { display: inline-block; padding: .75rem 2rem; border-radius: 9999px; font-weight: 700; text-decoration: none; font-size: 1rem; }
  .btn-wa { background: #25d366; color: #fff; }
  .btn-email { background: rgba(255,255,255,.2); color: #fff; border: 2px solid rgba(255,255,255,.6); }
  .btn-wa:hover { background: #20b356; }
  .btn-email:hover { background: rgba(255,255,255,.3); }
  main { max-width: 900px; margin: 3rem auto; padding: 0 1.5rem; display: grid; gap: 1.5rem; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
  .card { background: #fff; border-radius: 1rem; padding: 2rem; box-shadow: 0 2px 12px rgba(0,0,0,.06); }
  .card h3 { font-size: 1.15rem; font-weight: 700; margin-bottom: .5rem; color: rgb(var(--c)); }
  .card p { color: #475569; line-height: 1.7; }
  footer { text-align: center; padding: 2rem; color: #94a3b8; font-size: .9rem; border-top: 1px solid #e2e8f0; margin-top: 2rem; }
  @media (max-width: 480px) { header h1 { font-size: 1.8rem; } }
</style>
</head>
<body>
<header>
  <h1>${esc(negocio)}</h1>
  <p>${esc(descripcion)}</p>
  <div class="cta">
    ${waLink ? `<a href="https://wa.me/${waLink}" class="btn btn-wa">💬 Escríbenos por WhatsApp</a>` : ''}
    ${email ? `<a href="mailto:${esc(email)}" class="btn btn-email">✉️ ${esc(email)}</a>` : ''}
  </div>
</header>
<main>
${seccionesHtml}
</main>
<footer>
  &copy; ${new Date().getFullYear()} ${esc(negocio)}${email ? ` · <a href="mailto:${esc(email)}" style="color:inherit">${esc(email)}</a>` : ''}
</footer>
</body>
</html>`;
}

// Empaqueta la landing en un zip en el directorio de uploads y devuelve uploadId
export async function buildLandingZip(fields) {
  const { default: AdmZip } = await import('adm-zip');
  const html = generateLandingHtml(fields);
  const zip = new AdmZip();
  zip.addFile('index.html', Buffer.from(html, 'utf8'));
  const uploadId = crypto.randomUUID();
  const zipPath = path.join(config.dataDir, 'uploads', `${uploadId}.zip`);
  const { mkdirSync } = await import('fs');
  mkdirSync(path.join(config.dataDir, 'uploads'), { recursive: true });
  zip.writeZip(zipPath);
  return uploadId;
}
