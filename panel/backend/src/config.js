import 'dotenv/config';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function required(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`[config] Falta la variable de entorno ${name} (ver .env.example)`);
    process.exit(1);
  }
  return v;
}

const nodesFile = path.join(root, 'config', 'nodes.json');
if (!existsSync(nodesFile)) {
  console.error('[config] Falta config/nodes.json (copia config/nodes.example.json y rellena los tokens)');
  process.exit(1);
}

const nodes = JSON.parse(readFileSync(nodesFile, 'utf8'));
for (const n of nodes) {
  const required_proxmox = ['name', 'host', 'tokenId', 'tokenSecret', 'storage', 'templateVmid', 'vmidRange', 'subnetPrefix'];
  const required_hyperv  = ['name', 'host', 'agentPort', 'agentToken', 'subnetPrefix', 'vmidRange'];
  const req = n.type === 'hyperv' ? required_hyperv : required_proxmox;
  for (const k of req) {
    if (n[k] === undefined) {
      console.error(`[config] nodes.json: al nodo "${n.name ?? '?'}" le falta el campo "${k}"`);
      process.exit(1);
    }
  }
}

const dataDir = path.join(root, 'data');
mkdirSync(dataDir, { recursive: true });

export const config = {
  port: Number(process.env.PORT || 3001),
  host: process.env.HOST || '127.0.0.1',
  panelPassword: required('PANEL_PASSWORD'),
  jwtSecret: required('JWT_SECRET'),
  credSecret: required('CRED_SECRET'),
  sessionHours: Number(process.env.SESSION_HOURS || 12),
  // Portal de clientes
  appsDomain: process.env.APPS_DOMAIN || '',
  appsDuckdnsToken: process.env.APPS_DUCKDNS_TOKEN || '',
  panelPublicUrl: process.env.PANEL_PUBLIC_URL || 'https://capuvps.duckdns.org',
  nodesSshKey: '/home/admin/.ssh/panel_nodes',
  // Webhook (FossBilling → panel)
  webhookSecret: process.env.WEBHOOK_SECRET || '',
  // SMTP para envío de emails de invitación
  smtpHost: process.env.SMTP_HOST || '',
  smtpPort: Number(process.env.SMTP_PORT || 587),
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  smtpFrom: process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@capuvps.duckdns.org',
  // ── Pasarelas de pago (opcionales — modo manual si no están configuradas) ──
  // Stripe (tarjeta de crédito/débito)
  stripePublicKey: process.env.STRIPE_PUBLIC_KEY || '',
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  // SPEI (transferencia bancaria México)
  speiClabe: process.env.SPEI_CLABE || '',
  speiBank: process.env.SPEI_BANK || 'STP',
  speiBeneficiario: process.env.SPEI_BENEFICIARIO || 'CapuVPS Hosting',
  openpayMerchantId: process.env.OPENPAY_MERCHANT_ID || '',
  // Crypto (Bitcoin / Ethereum / USDT)
  bitcoinAddress: process.env.BITCOIN_ADDRESS || '',
  ethereumAddress: process.env.ETHEREUM_ADDRESS || '',
  usdtTrc20Address: process.env.USDT_TRC20_ADDRESS || '',
  nowpaymentsApiKey: process.env.NOWPAYMENTS_API_KEY || '',
  nowpaymentsIpnSecret: process.env.NOWPAYMENTS_IPN_SECRET || '',
  // IA para selección de nodo (opcional — fallback rule-based si no está configurada)
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  nodes,
  dataDir,
};
