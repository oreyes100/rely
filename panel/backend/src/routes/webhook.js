import { Router } from 'express';
import crypto from 'crypto';
import { config } from '../config.js';
import { HttpError } from '../errors.js';
import { createInvite } from '../services/clients.js';
import { sendInviteEmail } from '../services/mailer.js';

export const webhookRouter = Router();

// Webhook llamado por FossBilling al registrar un cliente
// Autenticado con shared secret (no necesita JWT)
webhookRouter.post('/fossbilling-signup', async (req, res, next) => {
  try {
    if (!config.webhookSecret) throw new HttpError(503, 'Webhook no configurado');

    const provided = req.headers['x-webhook-secret'] ?? '';
    const expected = config.webhookSecret;
    // Comparación resistente a timing attack
    const ok = provided.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
    if (!ok) throw new HttpError(401, 'Webhook secret inválido');

    const { email, name, client_id } = req.body ?? {};
    if (!email) throw new HttpError(400, 'email requerido');

    // Generar código de invitación
    const code = createInvite();

    // Enviar email con el código
    const emailSent = await sendInviteEmail({
      to: email,
      name: name ?? '',
      inviteCode: code,
      panelUrl: config.panelPublicUrl,
    }).catch((err) => {
      console.error('[webhook] Error enviando email:', err.message);
      return false;
    });

    console.log(`[webhook] FossBilling signup: client_id=${client_id} email=${email} invite=${code} emailSent=${emailSent}`);

    res.json({ ok: true, inviteCode: code, emailSent });
  } catch (e) { next(e); }
});
