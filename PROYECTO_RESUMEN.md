# Resumen Completo del Proyecto: Despliegue Wiki + VideoToObsidian en VPS

---

## 🎯 Objetivo Inicial

Montar en el **mismo servidor VPS** de `https://dineroorganizado.duckdns.org/` el repo privado `https://github.com/oreyes100/obsidian-vault` y hacerlo visible en subdominios:

| Subdominio | Destino | Autenticación |
|------------|---------|---------------|
| `wiki.dineroorganizado.duckdns.org` | Vault Obsidian como wiki (Quartz) | **Basic Auth** (detrás de login) |
| `video.dineroorganizado.duckdns.org` | App VideoToObsidian (FastAPI + frontend) | Token Bearer propio de la app |

---

## 🏗️ Arquitectura de Red Existente

```
Internet (207.248.113.8)
       │
       ▼
Edge nginx (192.168.1.34) ──────► DNAT pve (192.168.1.4):8446 → 192.168.6.191:443
       │                                  │
       │                                  ▼
       │                         VPS 501 "misfinz" (192.168.6.191)
       │                                  │
       │                    nginx :443 (SNI routing)
       │                         ├── dineroorganizado.duckdns.org → node 127.0.0.1:3000
       │                         ├── wiki.dineroorganizado.duckdns.org  → static /home/devops/wiki (basic auth)
       │                         └── video.dineroorganizado.duckdns.org → FastAPI 127.0.0.1:8000
```

**Credenciales de acceso:**
- pvedell (192.168.1.96): root / `Michoacan1`
- VPS 501: root via ProxyJump `ssh -o ProxyJump="root@192.168.1.4" root@192.168.6.191`
- Edge: root @ 192.168.1.34

---

## ✅ Lo Completado (Wiki - 100%)

### 1. Preparación Local
- Clonado repo privado `oreyes100/obsidian-vault` (credenciales Windows Credential Manager)
- Estructura del vault: `No sync/Proyectos/Obsidian Vault/` con 106 notas
- **Secretos detectados** en `Meta/Contexto Activo.md` y `Meta/Top Of Mind.md` (credenciales reales tipo `jr / MisFinanzas2026!`)
- Usuario decide: **wiki detrás de login** (basic auth nginx)

### 2. Build Quartz v4.5.2 (Local Windows)
- Descargado tarball (git clone fallaba por red)
- Configurado `quartz.config.ts`:
  - `pageTitle: "Wiki de Denero"`
  - `locale: "es-ES"`, `baseUrl: "wiki.dineroorganizado.duckdns.org"`
  - Analytics deshabilitado, `CustomOgImages` comentado para velocidad
- Contenido copiado a `content/`: Wiki, MOCs, Meta, Logs (excluido VideotoObsidian code)
- `index.md` raíz creado con enlaces al MOC Index principal
- `npm install` (483 paquetes, 29s) → `npx quartz build` (86 archivos, 155 emitidos, 6.2 MB)

### 3. Despliegue VPS 501
- `scp` vía ProxyJump → `/home/devops/wiki`
- **Cert self-signed SAN** `/etc/nginx/ssl/wiki/` (wiki + video)
- **htpasswd** `/etc/nginx/htpasswd-wiki` con `openssl passwd -apr1` → usuario `jr` / pass `Michoacan1.`
- **Server block nginx** `/etc/nginx/sites-available/wiki`:
  - 443 SSL + basic auth → root `/home/devops/wiki`
  - `try_files $uri $uri.html $uri/ =404` (soporte URLs sin extensión .html de Quartz)

### 4. Edge (192.168.1.34)
- Vhost manual `wiki.dineroorganizado.duckdns.org`:
  - `proxy_pass https://192.168.1.4:8446`
  - `proxy_ssl_verify off`, `proxy_ssl_server_name on`, `proxy_ssl_name wiki.dineroorganizado.duckdns.org`
- **Cert Let's Encrypt** vía `acme.sh --issue -w /var/www/acme -d wiki.dineroorganizado.duckdns.org --server letsencrypt --force`
- Instalado con `--install-cert` y reload nginx

### 5. Verificación E2E Wiki ✅
```bash
curl -s -o /dev/null -w "%{http_code}" https://wiki.dineroorganizado.duckdns.org/        # 401
curl -s -u "jr:Michoacan1." -o /dev/null -w "%{http_code}" https://wiki.dineroorganizado.duckdns.org/  # 200
# URLs sin extensión .html funcionan: /MOCs/MOC---Index, /Wiki/pdf-to-wiki, etc.
```

---

## ⏳ VideoToObsidian (En Progreso ~60%)

### Estado Actual
| Paso | Estado |
|------|--------|
| Repo copiado a VPS (`/home/devops/videotoobsidian`) | ✅ |
| ffmpeg instalado en VPS | ✅ |
| Python venv creado (`/home/devops/videotoobsidian/.venv`) | ✅ |
| `pip install -r backend/requirements.txt` | ❌ **Bloqueado** (abortado 3×) |
| Servicio systemd FastAPI 127.0.0.1:8000 | ⏳ Pendiente |
| Server block nginx `video.dineroorganizado.duckdns.org` | ⏳ Pendiente |
| Edge vhost + cert Let's Encrypt | ⏳ Pendiente |
| Verificación E2E | ⏳ Pendiente |

### Detalles Técnicos App
- **Entrypoint**: `run.py` → `uvicorn.run("run:app", host="0.0.0.0", port=8000)`
- **Frontend**: servido por FastAPI `app.mount("/", StaticFiles(directory="frontend", html=True))`
- **Auth**: Bearer token (`api_auth_token` generado al inicio, requests desde localhost pasan sin token)
- **Requirements clave**: `fastapi`, `uvicorn`, `openai-whisper==20240930` (→ torch CPU), `yt-dlp`, `sqlalchemy`, `edge-tts`, `whoosh`
- **Config**: `.env` con `LLM_PROVIDER`, `OPENROUTER_API_KEY`, `WHISPER_MODEL=tiny`, etc.

### Problema Actual: Instalación Deps
- `openai-whisper` requiere `setuptools`/`pkg_resources` en build time
- Intento con `--no-build-isolation` se aborta por falta de salida visible (timeout largo sin feedback)
- Venv actual solo tiene: `pip`, `setuptools`, `wheel`, `packaging`

---

## 📋 Próximos Pasos Inmediatos

1. **Instalar requirements** en background con log visible:
   ```bash
   ssh ... "cd /home/devops/videotoobsidian && nohup ./.venv/bin/pip install --no-cache-dir --no-build-isolation -r backend/requirements.txt > /tmp/pip_install.log 2>&1 &"
   # Monitorear: tail -f /tmp/pip_install.log
   ```

2. **Crear servicio systemd** `/etc/systemd/system/videotoobsidian.service`:
   ```ini
   [Unit]
   Description=VideoToObsidian FastAPI
   After=network.target
   
   [Service]
   Type=simple
   User=devops
   WorkingDirectory=/home/devops/videotoobsidian
   ExecStart=/home/devops/videotoobsidian/.venv/bin/python run.py
   Restart=on-failure
   Environment=PYTHONUNBUFFERED=1
   
   [Install]
   WantedBy=multi-user.target
   ```

3. **Server block VPS 501** `/etc/nginx/sites-available/video`:
   ```nginx
   server {
       listen 443 ssl; server_name video.dineroorganizado.duckdns.org;
       ssl_certificate /etc/nginx/ssl/wiki/fullchain.pem;
       ssl_certificate_key /etc/nginx/ssl/wiki/key.pem;
       location / { proxy_pass http://127.0.0.1:8000; proxy_set_header Host $host; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto https; }
   }
   server { listen 80; server_name video.dineroorganizado.duckdns.org; return 301 https://$host$request_uri; }
   ```

4. **Edge vhost video** (patrón idéntico a wiki, `proxy_ssl_name video.dineroorganizado.duckdns.org`) + cert Let's Encrypt

5. **Verificación E2E** ambos subdominios

---

## 🔑 Credenciales y Secrets

| Componente | Credenciales |
|------------|--------------|
| Wiki basic auth | `jr` / `Michoacan1.` (htpasswd apr1) |
| pvedell root | `Michoacan1` |
| VideoToObsidian API token | Se genera auto al primer arranque (`ensure_token()`) |
| LLM (OpenRouter) | **Pendiente** - usuario debe proveer `OPENROUTER_API_KEY` en `.env` |

---

## 📁 Archivos Clave en Local

```
C:\vpsserver\obsidian-vault\                          # Repo clonado (privado)
C:\Users\User\AppData\Local\Temp\opencode\quartz\     # Quartz build local
C:\Users\User\AppData\Local\Temp\opencode\quartz\public\  # Output wiki (155 archivos)
C:\vpsserver\obsidian-vault\No sync\Proyectos\Obsidian Vault\VideotoObsidian\  # App source
```

---

## 🐛 Issues Conocidos / Pendientes

1. **pip install se aborta**: sin output visible hasta terminar → solución: log a archivo + tail -f
2. **Whisper/torch**: descarga ~200MB CPU wheel, puede tardar 2-5 min en VPS
3. **LLM API Key**: app arranca sin key pero análisis LLM falla gracefully ("LLM no configurado")
4. **DNS**: ambos subdominios ya resuelven a 207.248.113.8 (wildcard DuckDNS)

---

## ✅ Checklist Final

- [x] Wiki build local (Quartz)
- [x] Wiki deploy VPS + basic auth
- [x] Wiki edge vhost + TLS
- [x] Wiki E2E verificado
- [ ] VideoToObsidian deps instaladas
- [ ] VideoToObsidian systemd service
- [ ] VideoToObsidian nginx VPS
- [ ] VideoToObsidian edge vhost + TLS
- [ ] VideoToObsidian E2E verificado
- [ ] Configurar `OPENROUTER_API_KEY` en `.env` del VPS

---

*Última actualización: 2026-08-14*
*Chat session: opencode + MCP pfSense + SSH deployment*