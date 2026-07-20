import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { config } from '../config.js';
import { HttpError } from '../errors.js';
import { approveClient } from './clients.js';
import { sendAdminAlert } from './mailer.js';

const paymentsFile = path.join(config.dataDir, 'payments.json');

export const PLANS = {
  basico: {
    id: 'basico', label: 'Básico', price: 99, currency: 'MXN', priceUsd: 5,
    quota: 1, billing: 'mes',
    features: ['1 vCPU · 1 GB RAM', '20 GB SSD NVMe', '1 proyecto', 'SSL + dominio gratis'],
  },
  estandar: {
    id: 'estandar', label: 'Estándar', price: 199, currency: 'MXN', priceUsd: 10,
    quota: 2, billing: 'mes',
    features: ['2 vCPU · 2 GB RAM', '25 GB SSD NVMe', '2 proyectos', 'SSL + dominio propio', 'Base de datos incluida'],
  },
  empresarial: {
    id: 'empresarial', label: 'Empresarial', price: 399, currency: 'MXN', priceUsd: 20,
    quota: 5, billing: 'mes',
    features: ['4 vCPU · 4 GB RAM', '50 GB SSD NVMe', '5 proyectos', 'Dominio administrado', 'Multi-DB + Redis', 'Soporte prioritario'],
  },
};

function readPayments() {
  if (!existsSync(paymentsFile)) return [];
  try { return JSON.parse(readFileSync(paymentsFile, 'utf8')); } catch { return []; }
}
function savePayments(list) { writeFileSync(paymentsFile, JSON.stringify(list, null, 2)); }

export function getPlanInfo(plan) {
  const p = PLANS[plan];
  if (!p) throw new HttpError(400, `Plan desconocido: ${plan}. Usa basico, estandar o empresarial.`);
  return p;
}

export function listPlans() { return Object.values(PLANS); }

// ── Crear orden de pago ───────────────────────────────────────────────────────
export async function createOrder({ clientId, plan, method }) {
  const planInfo = getPlanInfo(plan);
  if (!['card', 'spei', 'crypto'].includes(method)) {
    throw new HttpError(400, 'Método inválido: usa card, spei o crypto');
  }

  // Cancelar órdenes pendientes anteriores del mismo cliente + plan
  const all = readPayments();
  for (const o of all) {
    if (o.clientId === clientId && o.status === 'pending') {
      o.status = 'cancelled';
      o.updatedAt = new Date().toISOString();
    }
  }
  savePayments(all);

  const id = crypto.randomUUID();
  const refCode = `CVPS-${id.slice(0, 8).toUpperCase()}`;
  const order = {
    id, refCode, clientId, plan, method,
    amount: planInfo.price, currency: planInfo.currency, priceUsd: planInfo.priceUsd,
    status: 'pending', // pending | processing | paid | failed | cancelled
    paymentData: null,
    providerRef: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    paidAt: null,
  };

  order.paymentData = buildPaymentData(method, order, planInfo);

  const payments = readPayments();
  payments.push(order);
  savePayments(payments);

  // Notificar al admin de nueva orden
  sendAdminAlert({
    subject: `[Pago] Nueva orden ${refCode} — Plan ${planInfo.label}`,
    body: `Cliente: ${clientId}\nPlan: ${planInfo.label}\nMétodo: ${method}\nImporte: $${planInfo.price} MXN\nReferencia: ${refCode}\n\nAcción: Confirma en el panel de admin si el pago no se valida automáticamente.`,
  }).catch(() => {});

  return order;
}

function buildPaymentData(method, order, planInfo) {
  if (method === 'card') {
    if (config.stripePublicKey) {
      return {
        mode: 'stripe',
        publicKey: config.stripePublicKey,
        note: 'Pago con tarjeta vía Stripe (3DS incluido)',
      };
    }
    return {
      mode: 'manual',
      note: 'Pago con tarjeta no disponible en este momento. Usa transferencia o crypto, o contacta al administrador.',
    };
  }

  if (method === 'spei') {
    return {
      mode: config.openpayMerchantId ? 'openpay' : 'manual',
      clabe: config.speiClabe || '710969000000100004',
      banco: config.speiBank || 'STP / BANORTE',
      beneficiario: config.speiBeneficiario || 'CapuVPS Hosting',
      amount: planInfo.price,
      currency: 'MXN',
      referencia: order.refCode,
      concepto: `Plan ${planInfo.label} CapuVPS`,
      instrucciones: [
        `Monto exacto: $${planInfo.price}.00 MXN`,
        `CLABE: ${config.speiClabe || '710969000000100004'}`,
        `Referencia/Concepto: ${order.refCode}`,
        'El pago se acredita en 1-2 horas hábiles.',
        'Incluye la referencia exacta para evitar demoras.',
      ],
    };
  }

  if (method === 'crypto') {
    return {
      mode: config.nowpaymentsApiKey ? 'nowpayments' : 'manual',
      bitcoin: config.bitcoinAddress || null,
      ethereum: config.ethereumAddress || null,
      usdt_trc20: config.usdtTrc20Address || null,
      amountUsd: planInfo.priceUsd,
      referencia: order.refCode,
      instrucciones: [
        `Equivalente: ~$${planInfo.priceUsd} USD`,
        'Incluye la referencia en el memo/comentario.',
        'Los pagos crypto se verifican en 30-60 minutos.',
        'Tipo de cambio aplicado al momento del pago.',
      ],
    };
  }
  return null;
}

// ── Obtener / listar ──────────────────────────────────────────────────────────
export function getOrder(id) {
  const p = readPayments().find((p) => p.id === id || p.refCode === id);
  if (!p) throw new HttpError(404, 'Orden no encontrada');
  return p;
}

export function listClientOrders(clientId) {
  return readPayments().filter((p) => p.clientId === clientId);
}

export function listAllOrders() {
  return readPayments().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

// ── Confirmar pago (manual o por webhook) ────────────────────────────────────
export async function confirmPayment(orderId, { providerRef, confirmedBy = 'webhook' } = {}) {
  const payments = readPayments();
  const idx = payments.findIndex((p) => p.id === orderId);
  if (idx === -1) throw new HttpError(404, 'Orden no encontrada');
  const order = payments[idx];
  if (order.status === 'paid') return order; // idempotente

  order.status = 'paid';
  order.paidAt = new Date().toISOString();
  order.updatedAt = new Date().toISOString();
  order.providerRef = providerRef ?? null;
  order.confirmedBy = confirmedBy;
  savePayments(payments);

  const planInfo = getPlanInfo(order.plan);
  await approveClient(order.clientId, { quota: planInfo.quota, plan: order.plan });

  console.log(`[payments] Pago confirmado: order=${orderId} plan=${order.plan} client=${order.clientId} by=${confirmedBy}`);
  return order;
}

// ── Marcar como fallido / cancelado ──────────────────────────────────────────
export function cancelOrder(orderId) {
  const payments = readPayments();
  const idx = payments.findIndex((p) => p.id === orderId);
  if (idx === -1) throw new HttpError(404, 'Orden no encontrada');
  payments[idx].status = 'cancelled';
  payments[idx].updatedAt = new Date().toISOString();
  savePayments(payments);
  return payments[idx];
}

// ── Webhooks ──────────────────────────────────────────────────────────────────
export async function handleStripeWebhook(rawBody, signature) {
  if (!config.stripeSecretKey || !config.stripeWebhookSecret) {
    throw new HttpError(503, 'Stripe no configurado');
  }
  // dynamic import para evitar error si stripe no está instalado
  const Stripe = (await import('stripe').catch(() => null))?.default;
  if (!Stripe) throw new HttpError(503, 'Módulo stripe no instalado (npm i stripe)');

  const stripe = Stripe(config.stripeSecretKey);
  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, config.stripeWebhookSecret);
  } catch (err) {
    throw new HttpError(400, `Webhook Stripe inválido: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const orderId = session.metadata?.capuvpsOrderId;
    if (orderId) await confirmPayment(orderId, { providerRef: session.payment_intent, confirmedBy: 'stripe' });
  }
  return { received: true };
}

export async function handleNowPaymentsWebhook(body) {
  const { order_id: orderId, payment_status, payment_id } = body ?? {};
  if (!orderId) throw new HttpError(400, 'order_id requerido');
  if (payment_status === 'finished' || payment_status === 'confirmed') {
    await confirmPayment(orderId, { providerRef: String(payment_id), confirmedBy: 'nowpayments' });
  }
  return { received: true };
}
