# Manual del Ingeniero Frontend — Panel VPS

## Visión general

El frontend es una **React 18 + TypeScript + Vite + Tailwind CSS** SPA servida como estáticos desde `/opt/vps-panel/frontend/dist/` en el edge server (`192.168.1.34`).

Hay **dos experiencias distintas** dentro de la misma app, separadas por el rol JWT:
- **Admin Panel** — gestión de VMs Proxmox, credenciales, historial, consola
- **Portal de Cliente** — crear proyectos, ver progreso de deploy, gestionar base de datos

---

## Árbol de archivos

```
panel/frontend/src/
├── main.tsx                    # Punto de entrada React
├── App.tsx                     # Enrutamiento por rol (admin/client)
├── format.ts                   # Helpers: bytes, uptime, etc.
├── api/
│   ├── client.ts               # fetch wrapper con JWT, getRole(), clearToken()
│   ├── queries.ts              # funciones tipadas para cada endpoint
│   └── types.ts                # Interfaces TypeScript de todos los modelos
└── components/
    ├── Login.tsx               # Login Admin + Login/Registro Cliente
    ├── DashboardLayout.tsx     # Shell del panel admin (sidebar, nav)
    ├── ResourceMonitor.tsx     # Dashboard de recursos de nodos
    ├── VpsList.tsx             # Lista de VMs
    ├── ProvisioningForm.tsx    # Formulario de nueva VM
    ├── CredentialManager.tsx   # Gestión de credenciales
    ├── HistoryLog.tsx          # Log de eventos
    ├── ProxmoxConsole.tsx      # Consola VNC/SPICE embebida
    ├── Services.tsx            # Servicios adicionales
    └── portal/
        ├── PortalLayout.tsx    # Shell del portal de cliente (header, nav)
        ├── MisProyectos.tsx    # Lista de proyectos con polling
        ├── NuevoProyecto.tsx   # Wizard de 5 pasos para crear proyecto
        └── ProgresoDeploy.tsx  # Vista de pasos del pipeline + datos de DB
```

---

## Routing por rol

`App.tsx` detecta el rol del JWT (sin verificar firma — solo para routing de UI):

```typescript
// api/client.ts
export function getRole(): 'admin' | 'client' | null {
  const token = localStorage.getItem('panel_token');
  if (!token) return null;
  const payload = JSON.parse(atob(token.split('.')[1]));
  return payload.role === 'client' ? 'client' : 'admin';
}
```

```typescript
// App.tsx — routing
if (!authed)         return <Login onLogin={handleLogin} />;
if (role === 'client') return <ClientPortal />;
return <AdminPanel />;
```

**No hay React Router.** La navegación es estado local (`useState<Page>`). Para agregar páginas nuevas al admin, añadir un valor al tipo `Page` en `DashboardLayout.tsx` y manejar el render en `AdminPanel`.

---

## API Client (`api/client.ts`)

```typescript
// Llamada tipada a cualquier endpoint
const data = await api<TipoRespuesta>('/endpoint', {
  method: 'POST',
  body: JSON.stringify({ campo: 'valor' }),
});

// Manejo de tokens
setToken(tokenString);    // guarda en localStorage
getToken(): string|null   // lee token
clearToken()              // borra (usado en logout)
getRole()                 // decodifica payload sin verificar
```

Los errores llegan como `ApiError` con `.status` HTTP. El cliente desloguea automáticamente en 401.

---

## Tipos (`api/types.ts`)

Todos los modelos del sistema están tipados aquí. Al agregar un endpoint nuevo en el backend, añadir la interfaz correspondiente aquí antes de consumirlo en un componente.

```typescript
// Modelos del portal de cliente
interface ProyectoPortal {
  id: string; nombre: string; url: string; plan: string;
  estado: 'activo' | 'en progreso' | 'error' | 'eliminado';
  pasos: PasoPortal[]; db: DbInfo | null; creadoEl: string;
}

// Modelos de infraestructura admin
interface NodeInfo { ... }
interface Vm { ... }
interface Credential { ... }
```

---

## Portal de Cliente — flujo de datos

### MisProyectos.tsx

```
mount → GET /api/portal/projects → setProyectos()
    └── proyectos.some(en-progreso) → setTimeout(cargar, 4000)  ← polling automático
```

El polling se auto-cancela cuando ya no hay proyectos en progreso.

### NuevoProyecto.tsx

Wizard de 5 pasos. Estado local, sin librerías de formulario.

```
Paso 1: nombre (hostname) → validación regex
Paso 2: tipo fuente (plantilla | git) → subcampos condicionales
Paso 3: base de datos → 4 opciones (ninguna/postgres/mysql/mongo)
Paso 4: dominio → 3 opciones (plataforma/duckdns/propio) → subcampos condicionales
Paso 5: confirmación → POST /api/portal/projects → redirect a proyectos
```

### ProgresoDeploy.tsx

Componente puro (sin estado, sin efectos). Recibe un `ProyectoPortal` y renderiza:
- Lista de pasos con iconos y colores por estado
- Enlace al sitio si está activo
- Tarjeta de credenciales de BD si existe

---

## Convenciones de estilo

**Tailwind CSS con clases utilitarias.**

Clases de componente frecuentes (definidas en `index.css`):
```
.card        — panel con fondo slate-800, borde slate-700, padding
.btn-primary — botón indigo-600
.btn-secondary — botón slate-700
.input       — input oscuro con focus ring
.label       — label pequeña gris
```

**Dark mode by default** — el diseño asume fondo oscuro. Usar `text-slate-100/200/400/500` para texto, `bg-slate-800/900` para fondos.

---

## Cómo agregar una página al Portal de Cliente

1. Crear `panel/frontend/src/components/portal/MiPagina.tsx`
2. Añadir el valor al tipo en `App.tsx`:
   ```typescript
   type PortalPage = 'proyectos' | 'nuevo' | 'mi-pagina';
   ```
3. Agregar el botón en `PortalLayout.tsx`:
   ```typescript
   ['mi-pagina', 'Mi Página']
   ```
4. Renderizar en `ClientPortal` en `App.tsx`:
   ```typescript
   {page === 'mi-pagina' && <MiPagina />}
   ```

---

## Cómo agregar una página al Panel Admin

1. Crear `panel/frontend/src/components/MiAdminPage.tsx`
2. En `DashboardLayout.tsx`, añadir la entrada al objeto `PAGES`:
   ```typescript
   const PAGES = { ..., 'mi-pagina': { label: 'Mi Página', icon: '...' } };
   ```
3. En `AdminPanel` en `App.tsx`:
   ```typescript
   {page === 'mi-pagina' && <MiAdminPage />}
   ```

---

## Cómo consumir un endpoint nuevo

```typescript
// 1. Definir el tipo en api/types.ts
export interface MiRecurso { id: string; nombre: string; }

// 2. Crear una función en api/queries.ts (opcional pero recomendado)
export async function getMisRecursos() {
  return api<MiRecurso[]>('/mis-recursos');
}

// 3. Usar en el componente
const [recursos, setRecursos] = useState<MiRecurso[]>([]);
useEffect(() => {
  getMisRecursos().then(setRecursos).catch(console.error);
}, []);
```

---

## Build y deploy

```bash
# Desde la máquina local (Windows/WSL)
cd panel/frontend
npm run build        # tsc --noEmit && vite build → dist/

# Copiar al servidor
scp -r dist/. root@192.168.1.34:/opt/vps-panel/frontend/dist/
```

El backend no necesita reiniciarse; nginx sirve los estáticos directamente.

**El build falla si hay errores de TypeScript** (`tsc --noEmit` corre antes de Vite). Esto es intencional — no deployar con errores de tipos.

---

## Verificar que el deploy funcionó

```bash
# Desde cualquier lugar con internet
curl -sk https://capuvps.duckdns.org/ | grep '<title>'
# Debe retornar: <title>Panel VPS — Proxmox</title>
```

---

## Variables de entorno de Vite

No se usan variables de entorno en el frontend en producción. La URL base de la API es relativa (`/api/...`), así que funciona independientemente del dominio.

Para desarrollo local con el backend en otro puerto, crear `panel/frontend/.env.local`:
```
VITE_API_BASE=http://localhost:3001
```
Y actualizar `api/client.ts` para leer `import.meta.env.VITE_API_BASE`.

---

## Dependencias clave

| Paquete | Versión | Para qué |
|---------|---------|---------|
| react | 18 | UI |
| typescript | 5 | Tipos |
| vite | 6 | Build + dev server |
| tailwindcss | 3 | Estilos |

Sin librerías de estado global (no Redux, no Zustand). Sin React Router. Sin librerías de formularios.
