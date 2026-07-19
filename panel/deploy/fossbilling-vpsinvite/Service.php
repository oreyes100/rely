<?php

declare(strict_types=1);

namespace Box\Mod\Vpsinvite;

use Box_Event;

/**
 * Al registrarse un cliente en FossBilling, llama al panel VPS para
 * generar un código de invitación y enviarlo por email.
 *
 * Configurar en /opt/vps-panel/backend/.env:
 *   WEBHOOK_SECRET=<secreto-compartido>
 *   PANEL_PUBLIC_URL=https://capuvps.duckdns.org
 *
 * IMPORTANTE — registro en DB requerido (FossBilling no auto-descubre hooks):
 *   mysql -u USER -pPASS fossbilling_db <<SQL
 *   INSERT IGNORE INTO extension (type, name, status, version)
 *     VALUES ('mod', 'vpsinvite', 'installed', '1.0.0');
 *   INSERT INTO extension_meta (extension, rel_type, rel_id, meta_key, meta_value, created_at, updated_at)
 *     VALUES ('mod_hook','mod','vpsinvite','listener','onAfterClientSignUp', NOW(), NOW());
 *   SQL
 */
class Service implements \FOSSBilling\InjectionAwareInterface
{
    protected \Pimple\Container $di;

    public function setDi(\Pimple\Container $di): void
    {
        $this->di = $di;
    }

    public function getDi(): \Pimple\Container
    {
        return $this->di;
    }

    /**
     * Se ejecuta automáticamente después de que un cliente se registra.
     */
    public static function onAfterClientSignUp(Box_Event $event): bool
    {
        $di     = $event->getDi();
        $params = $event->getParameters();

        // Obtener datos del cliente recién registrado
        $clientId = $params['id'] ?? null;
        if (!$clientId) {
            $di['logger']->error('[vpsinvite] onAfterClientSignUp: no client id in params');
            return true;
        }

        try {
            /** @var \Model_Client $client */
            $clientService = $di['mod_service']('client');
            $client        = $clientService->get(['id' => $clientId]);

            $email = $client->email ?? '';
            $name  = trim(($client->first_name ?? '') . ' ' . ($client->last_name ?? ''));

            // Leer configuración desde el .env del panel (ubicación fija)
            $envFile = '/opt/vps-panel/backend/.env';
            $webhookSecret = self::readEnvVar($envFile, 'WEBHOOK_SECRET');
            $panelUrl      = self::readEnvVar($envFile, 'PANEL_PUBLIC_URL') ?: 'https://capuvps.duckdns.org';

            if (!$webhookSecret) {
                $di['logger']->error('[vpsinvite] WEBHOOK_SECRET no configurado en ' . $envFile);
                return true;
            }

            // Llamar al panel backend para generar el código e enviar el email
            $endpoint = 'http://127.0.0.1:3001/api/webhook/fossbilling-signup';
            $payload  = json_encode([
                'email'     => $email,
                'name'      => $name,
                'client_id' => $clientId,
            ]);

            $ch = curl_init($endpoint);
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_POST           => true,
                CURLOPT_POSTFIELDS     => $payload,
                CURLOPT_HTTPHEADER     => [
                    'Content-Type: application/json',
                    'X-Webhook-Secret: ' . $webhookSecret,
                ],
                CURLOPT_TIMEOUT        => 15,
            ]);

            $response   = curl_exec($ch);
            $httpStatus = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $curlError  = curl_error($ch);
            curl_close($ch);

            if ($curlError) {
                $di['logger']->error('[vpsinvite] curl error: ' . $curlError);
                return true;
            }

            $data = json_decode($response, true);

            if ($httpStatus !== 200 || empty($data['ok'])) {
                $di['logger']->error('[vpsinvite] webhook failed: HTTP ' . $httpStatus . ' — ' . $response);
                return true;
            }

            $di['logger']->info(sprintf(
                '[vpsinvite] Invite code %s sent to %s (emailSent=%s)',
                $data['inviteCode'] ?? '?',
                $email,
                ($data['emailSent'] ?? false) ? 'yes' : 'no (SMTP not configured)'
            ));
        } catch (\Exception $e) {
            $di['logger']->error('[vpsinvite] exception: ' . $e->getMessage());
        }

        return true;
    }

    /**
     * Lee una variable del archivo .env del panel sin ejecutar el archivo como PHP.
     */
    private static function readEnvVar(string $file, string $key): string
    {
        if (!is_readable($file)) {
            return '';
        }
        foreach (file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
            $line = trim($line);
            if (str_starts_with($line, '#') || !str_contains($line, '=')) {
                continue;
            }
            [$k, $v] = explode('=', $line, 2);
            if (trim($k) === $key) {
                return trim($v);
            }
        }
        return '';
    }
}
