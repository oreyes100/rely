# Bot de Telegram — Recibos en Cuentas: cambios realizados y causas

Documentación de los problemas de flujo que se corrigieron para que el bot de Telegram
reconociera (OCR con IA) y registrara transacciones en el módulo **Cuentas** (S-26/S-30)
de la app.

Servidor: `192.168.6.136` (devops) · App: `/opt/msp` (Next.js standalone, puerto 3000) · DB: `/opt/msp/data/msp.db`.

---

## 1. Qué hace hoy el bot (flujo final)

1. Se envía la foto de un recibo al **chat del bot** (grupo de la congregación).
2. Telegram llama al **webhook** `POST /api/cuentas/telegram` (`X-Telegram-Bot-Api-Secret-Token` firmado).
3. La ruta vincula `chat_id` → congregación mediante `messaging_settings.telegram_chat_id`.
4. Descarga el archivo vía `getFile` + `file/bot<token>/<path>` (máx. 8 MB, siempre la mayor resolución).
5. Llama al **motor de OCR unificado** `runReceiptOcr()` (Gemini) pasando el catálogo de códigos CT de la congregación.
6. El bot responde en el chat con la **propuesta** (líneas, códigos, total) y botones **✅ Registrar / ❌ Descartar**.
7. La propuesta queda en `cuentas_telegram_pending` (`status='pending'`) **hasta aprobación explícita**.
8. Al aprobar, se insertan las filas en `cuentas_transactions` (income/expense/transfer) dentro de una transacción SQL.

> Principio de diseño: **la aprobación es obligatoria y ocurre en Telegram**. Un recibo mal
> leído que entrara solo en la contabilidad es peor que uno que no entra.

---

## 2. Problemas corregidos y sus causas

### 2.1 El modelo de Gemini dejó de existir (error 404) — se pasó a alias `latest`
- **Causa**: se usaba el modelo con versión fija `gemini-2.5-flash`. Google retira esos
  modelos para cuentas nuevas y responden **404 «no longer available to new users»**.
- **Cambio**: `/opt/msp/src/lib/receiptOcr.ts` usa el alias `gemini-flash-latest`
  (`process.env.GEMINI_MODEL || 'gemini-flash-latest'`), que siempre apunta al modelo vigente.
- **Extras**: `GET /api/cuentas/ocr?models=1` consulta qué modelos admite la clave; los errores
  404/429/400/403 tienen ahora mensajes descriptivos (falta cuota → modelo sin plan gratuito, etc.).

### 2.2 La llamada interna al OCR vía HTTP propio fallaba en producción
- **Causa**: el agente de Telegram delegaba la lectura en un servicio HTTP interno
  (`CUENTAS_INTERNAL_URL`, antes apuntando a Naciones emoc... Ver `ecosystem.config.cjs`), que en
  producción fallaba.
- **Cambio**: la ruta `/api/cuentas/telegram` ahora **importa y llama directamente a
  `runReceiptOcr()`** (mismo proceso y misma DB). El comentario en el código lo dice explícito:
  *«llamada directa al motor (no vía HTTP propio, que falla en producción)»*.
- **Extra**: se creó `/api/cuentas/ocr/internal` (mismo motor, autenticado con el mismo
  `TELEGRAM_WEBHOOK_SECRET`) para procesos internos sin sesión de usuario.

### 2.3 Faltaban las variables de entorno del bot en el runner (PM2)
- **Causa**: el archivo `ecosystem.config.cjs` original no definía `TELEGRAM_WEBHOOK_SECRET` ni
  `GEMINI_API_KEY` → la ruta respondía `501 TELEGRAM_WEBHOOK_SECRET no configurado`.
- **Cambio**: se añadieron al entorno del proceso `meeting-scheduler-pro` en
  `/opt/msp/ecosystem.config.cjs` (el backup `ecosystem.config.cjs.bak.20260806032132` NO las tenía),
  y se reinició el proceso.
- **Verificación**: `GET /api/cuentas/telegram` → `{ "ok": true, "env": { "TELEGRAM_WEBHOOK_SECRET": true, "GEMINI_API_KEY": true } }`.

### 2.4 El esquema de Cuentas era «legacy» e incompatible con los respaldos
- **Causa**: la primera versión usaba enums en español (`entrada`/`recibido`) y columnas
  `destination_account`/`ct_code`; la versión definitiva replica los enums del programa legacy
  (`income`/`caja`, `to_account`, `code`). Sin migrar, el índice sobre `code` fallaba contra la
  tabla vieja y abortaba el schema.
- **Cambio**: `migrateCuentasLegacy()` en `/opt/msp/src/lib/sqlite.ts`, **ejecutado ANTES del
  schema** (si no, el CREATE INDEX revienta todo el arranque):
  - `cuentas_transactions` vieja → `cuentas_transactions` nueva (traducción de `type`/`account`,
    `destination_account` → `to_account`, `ct_code` → `code`).
  - `cuentas_ct_codes` → `cuentas_codes` (con `UNIQUE(code, congregation_id)`).
  - Datos migrados, no descartados (74 filas de transacciones preservadas).

### 2.5 Faltaban columnas y tablas nuevas del flujo Telegram/cuentas
- **Causa**: el schema inicial no tenía el almacén de propuestas ni los parámetros del cierre de mes.
- **Cambios añadidos** (runtime migrations y/o `schema.sql`):
  - `messaging_settings`: `telegram_enabled`, `telegram_bot_token`, `telegram_chat_id`,
    `telegram_notify_on_assign`, `telegram_notify_overdue`, `telegram_notify_weekly_status`,
    `telegram_weekly_dow`.
  - `cuentas_config`: `remit_code` (SOM), `res_pub_code` (RM), `res_pub_amount`,
    `res_pct_code`, `res_pct_percent`, `res_pct_source`, `ai_api_key` (clave Gemini por congregación).
  - Tabla nueva `cuentas_telegram_pending` (id, congregation_id, chat_id, message_id, file_id,
    `proposal` JSON, `status` pending/approved/rejected/error, resolved_by/resolved_at).
  - Tablas `cuentas_saldo_inicial` (saldo por YYYY-MM y cuenta) y `cuentas_config` (formulario/encabezado).

### 2.6 El webhook no quedaba registrado / sin política de rechazo
- **Causa**: sin `setWebhook` apuntando a la URL pública, Telegram no enviaba los updates.
- **Cambio/uerificación**: el webhook `POST` usa `placement_tip:0`... el `GET ?webhook=1` consulta
  `getWebhookInfo` de Telegram y **hoy está configurado**:
  `url = https://congregaciontj.duckdns.org/api/cuentas/telegram`, `pending_update_count: 0`,
  IP `207.248.113.8`. La ruta **rechaza (401)** updates sin `x-telegram-bot-api-secret-token` o sin
  chat vinculado (evita inyección de asientos por terceros; el chat solo se acepta si está en
  `messaging_settings` con `telegram_enabled=1`).

### 2.7 UI de configuración del bot inexistente
- **Causa**: no había forma de registrar token/chat/test desde la app para la congregación.
- **Cambio**: ruta `/api/telegram-settings` (GET/PUT) + `/api/telegram-settings/test` y frontend
  `/app/telegram/page.tsx` (toggle `telegram_enabled`, token, chat_id, botón «Enviar mensaje de
  prueba»). El **chat permitido del bot** se registra como `telegram_chat_id` en `messaging_settings`
  (para La Estación: `-5437600385`).

---

## 3. Estado actual en producción (verificado 2026-08-09)

- `messaging_settings`: una fila para la congregación `79d06d38-…` → `telegram_enabled=1`, chat
  `-5437600385`, token guardado.
- `cuentas_config`: congregación con `ai_api_key` propia (Gemini), `remit_code=SOM`, `res_pub_code=RM`, 10 %.
- `cuentas_transactions`: **74 asientos** (donaciones C/OM, remesas SOM, resolución RM, mantenimiento GM,
  depósitos D, etc.) — el bot ya ha registrado movimientos.
- `cuentas_codes`: 14 códigos CT (income/expense/transfer) replicando el catálogo legacy.
- `cuentas_telegram_pending`: 2 propuestas en estado pendiente (flujo de aprobación en uso).

Archivos clave:
- Webhook del bot: `/opt/msp/src/app/api/cuentas/telegram/route.ts`
- Motor OCR compartido: `/opt/msp/src/lib/receiptOcr.ts`
- OCR web / interno: `/opt/msp/src/app/api/cuentas/ocr/route.ts`, `ocr/internal/route.ts`
- Migraciones de esquema: `/opt/msp/src/lib/sqlite.ts` (`migrateCuentasLegacy`, runtime migrations)
- Schema definitivo: `/opt/msp/src/lib/schema.sql` (secciones 33–37 de Cuentas)
- Config runner: `/opt/msp/ecosystem.config.cjs` (env del proceso)
- Frontend bot: `/opt/msp/src/app/telegram/page.tsx` + `/opt/msp/src/app/api/telegram-settings/…`

---

## 4. Cómo verificarlo hoy

```bash
# Estado del bot (env, chat vinculado)
curl -s https://congregaciontj.duckdns.org/api/cuentas/telegram

# Estado del webhook según Telegram
curl -s "https://congregaciontj.duckdns.org/api/cuentas/telegram?webhook=1"

# Modelos que admite la clave de la congregación (requiere sesión)
# GET /api/cuentas/ocr?models=1
```

Flujo end-to-end esperado: enviar foto de recibo al bot → respuesta con propuesta y botones →
✅ Registrar → aparecen los asientos en `Cuentas` (S-26) y en `cuentas_transactions` con
`notes = 'Recibo aprobado en Telegram por …'`.