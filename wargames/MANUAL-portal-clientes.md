# Manual del Cliente — Portal de Hosting VPS

## ¿Qué es este servicio?

Esta plataforma te permite publicar tu sitio web o aplicación en internet de forma automática,
sin necesidad de conocimientos técnicos. Solo describes tu proyecto, eliges algunas opciones,
y en 5 a 15 minutos recibirás una dirección web funcional con HTTPS.

---

## Antes de empezar

Necesitas:
1. **Un código de invitación** — solicítalo a tu proveedor.
2. **Una dirección de correo electrónico** — será tu nombre de usuario.
3. **Tu proyecto**, en una de estas formas:
   - Repositorio público de GitHub o GitLab (URL https://)
   - Un sitio de negocio generado por la plataforma (llenar un formulario)

---

## Paso 1: Crear tu cuenta

1. Abre la dirección del portal que te proporcionó tu proveedor.
2. Haz clic en la pestaña **Cliente**.
3. Selecciona **Registrarse**.
4. Llena los campos:
   - **Nombre completo**: tu nombre real.
   - **Código de invitación**: el código de 12 caracteres que te dio tu proveedor.
   - **Correo electrónico**: el que usarás para iniciar sesión.
   - **Contraseña**: mínimo 8 caracteres.
5. Haz clic en **Crear cuenta**.

> Si el código ya fue usado o no es válido, pide uno nuevo a tu proveedor.

---

## Paso 2: Crear tu primer proyecto

Una vez dentro del portal verás la pantalla **Mis proyectos**.

1. Haz clic en **+ Nuevo proyecto**.
2. Sigue el asistente de 5 pasos:

### Paso 1 — Nombre del proyecto

Elige un nombre corto para tu proyecto. Solo letras minúsculas, números y guiones.
Ejemplos: `mi-tienda`, `consultorio-garcia`, `blog-personal`

Este nombre aparecerá en la dirección de tu sitio.

### Paso 2 — Código fuente

Tienes dos opciones:

**Opción A: Plantilla de negocio (sin código)**
- Ideal si no tienes un repositorio de código.
- Llena los datos de tu negocio: nombre, eslogan, descripción, WhatsApp y color.
- Se generará automáticamente un sitio web de presentación.

**Opción B: Repositorio Git**
- Si tienes un proyecto en GitHub o GitLab.
- Pega la URL de tu repositorio público (ej: `https://github.com/usuario/mi-app`).
- La plataforma detecta automáticamente el tipo de proyecto.

### Paso 3 — Base de datos

Si tu aplicación necesita guardar datos, elige el tipo de base de datos:

| Opción | Cuándo usarla |
|--------|---------------|
| Sin base de datos | Sitio estático, solo HTML/CSS/JS |
| PostgreSQL | Proyectos Node.js, Python, PHP modernos |
| MySQL | Proyectos con WordPress o PHP tradicional |
| MongoDB | Proyectos Node.js que usan datos en formato JSON |

Si no estás seguro, elige **PostgreSQL** (es la más versátil).

### Paso 4 — Dirección web (dominio)

Tres opciones según lo que tengas:

**Opción 1: Subdominio de la plataforma (más fácil)**
- No necesitas configurar nada.
- Tu sitio tendrá una dirección del tipo `mi-tienda.apps.pachucavps.duckdns.org`.
- Lista inmediatamente, con HTTPS incluido.

**Opción 2: Subdominio DuckDNS gratuito**
- Necesitas una cuenta en [duckdns.org](https://www.duckdns.org) (es gratis).
- Tu sitio quedará en: `mi-nombre.duckdns.org`
- Necesitarás tu **token de DuckDNS** (está en tu cuenta de duckdns.org).

**Opción 3: Dominio propio**
- Si ya tienes un dominio como `misitio.com`.
- Necesitas apuntar el DNS de tu dominio a nuestra IP. Te enviamos las instrucciones.
- El certificado HTTPS se configura automáticamente (puede tardar unos minutos extra).

### Paso 5 — Confirmar

Revisa el resumen y haz clic en **Crear proyecto**.

---

## Paso 3: Ver el progreso

Regresarás automáticamente a la pantalla **Mis proyectos**. Verás tu nuevo proyecto con el estado **Desplegando…**

Haz clic en **Detalles** para ver el progreso paso a paso:

| Etapa | Qué está pasando |
|-------|-----------------|
| Creando tu servidor | Se reserva una máquina virtual para tu proyecto |
| Iniciando el servidor | La VM arranca y el sistema operativo carga |
| Preparando el entorno | Se instala Docker y las herramientas necesarias |
| Descargando tu proyecto | Se copia tu código o plantilla al servidor |
| Analizando el proyecto | Se detecta el tipo de proyecto automáticamente |
| Construyendo tu aplicación | Se compila o prepara tu código para producción |
| Arrancando la aplicación | Tu aplicación inicia y se verifica que responde |
| Configurando seguridad | Se abren solo los puertos necesarios |
| Conectando a la red | Se configura el enrutamiento de red |
| Publicando en la web | Se registra tu proyecto en el servidor web |
| Configurando dominio | Se actualiza el DNS con tu dirección |
| Activando HTTPS | Se emite y configura el certificado SSL |
| Verificación final | Se comprueba que tu sitio es accesible desde internet |

El proceso completo toma entre 5 y 15 minutos. La pantalla se actualiza sola cada pocos segundos.

---

## Paso 4: Acceder a tu sitio

Cuando el estado cambie a **activo**, aparecerá un enlace directo a tu sitio. Haz clic en él para verlo.

---

## Información de base de datos

Si elegiste una base de datos, al terminar el despliegue verás una tarjeta con:

- **Usuario** y **Contraseña** de la base de datos
- **Nombre** de la base de datos
- **URL de conexión** (para usar en el código de tu aplicación)

> **Importante:** Guarda estos datos en un lugar seguro. La base de datos solo es accesible desde dentro de tu servidor, no desde internet.

---

## Opción con dominio propio — configurar DNS

Si elegiste **Dominio propio**, necesitas hacer un cambio en la configuración DNS de tu dominio.
Tu proveedor te dará:

- La **IP pública** del servidor
- El **tipo de registro** a crear (`A` para la raíz, `CNAME` para subdominios)

### Pasos generales (varía según tu registrador de dominio):

1. Entra a tu panel de control de dominio (GoDaddy, Namecheap, Google Domains, etc.)
2. Busca la sección **DNS** o **Gestión de DNS**
3. Crea un registro tipo `A`:
   - Nombre: `@` (o el subdominio, ej: `www`)
   - Valor: la IP que te proporcionó tu proveedor
   - TTL: 3600 (o "Automático")
4. Guarda los cambios

Los cambios de DNS pueden tardar entre 5 minutos y 48 horas en propagarse globalmente. En promedio, 15-30 minutos.

---

## Administrar tus proyectos

Desde la pantalla **Mis proyectos** puedes:

- **Ver detalles** de cada proyecto (estado, pasos, datos de DB)
- **Abrir tu sitio** con un clic cuando esté activo
- **Eliminar un proyecto** si ya no lo necesitas

> **Nota:** Al eliminar un proyecto se eliminan todos sus datos, incluyendo la base de datos. Esta acción no se puede deshacer.

---

## Límites de tu plan

Cada cuenta tiene un límite de proyectos activos simultáneos (generalmente 1 en el plan básico).
Si necesitas más, contacta a tu proveedor para ampliar tu cuota.

---

## ¿Algo salió mal?

Si tu proyecto aparece con estado **error**:

1. Haz clic en **Detalles** para ver en qué paso falló y el mensaje de error.
2. Comparte ese mensaje con tu proveedor para que pueda ayudarte.
3. Puedes **Eliminar** el proyecto con error y volver a crearlo desde cero.

Los errores más comunes:
- **URL de repositorio inválida**: asegúrate de que el repositorio sea público
- **Nombre de proyecto ya en uso**: elige un nombre diferente
- **Límite de proyectos alcanzado**: elimina uno antes de crear otro

---

## Contacto y soporte

Para cualquier duda o problema, contacta directamente a tu proveedor.
Ten a la mano:
- El **nombre de tu proyecto**
- El **estado** que muestra el portal
- El **mensaje de error** (si aplica)
