const FOSSBILLING_URL = '/fossbilling/';

const PLANS = [
  {
    id: 'basico',
    nombre: 'Básico',
    precio: '$99',
    periodo: '/mes',
    destacado: false,
    recursos: ['1 vCPU', '1 GB RAM', '20 GB SSD NVMe', 'Base de datos MySQL/PostgreSQL', 'Subdominio gratuito (*.capuvps.duckdns.org)', 'SSL incluido', '1 proyecto activo'],
  },
  {
    id: 'estandar',
    nombre: 'Estándar',
    precio: '$199',
    periodo: '/mes',
    destacado: true,
    recursos: ['2 vCPU', '2 GB RAM', '25 GB SSD NVMe', 'MySQL, PostgreSQL o MongoDB', 'Subdominio gratuito o dominio propio', 'SSL incluido', '2 proyectos activos', 'Soporte prioritario'],
  },
  {
    id: 'empresarial',
    nombre: 'Empresarial',
    precio: 'A la medida',
    periodo: '',
    destacado: false,
    recursos: ['vCPU y RAM configurables', 'Almacenamiento a la medida', 'Multi-DB y Redis', 'Dominio propio + DNS administrado', 'SLA dedicado', 'Soporte 24/7'],
  },
];

const PASOS = [
  { num: '01', titulo: 'Crea tu cuenta', desc: 'Regístrate en minutos. Solo necesitas tu correo electrónico.' },
  { num: '02', titulo: 'Elige tu plan', desc: 'Selecciona el plan que mejor se adapte a tu proyecto o negocio.' },
  { num: '03', titulo: 'Despliega tu app', desc: 'Sube tu código o usa una plantilla y nosotros nos encargamos del resto.' },
];

const FEATURES = [
  { icono: '⚡', titulo: 'Deploy en minutos', desc: 'Desde cero a producción en menos de 5 minutos. Sin configurar servidores.' },
  { icono: '🔒', titulo: 'HTTPS automático', desc: 'Certificados SSL/TLS gratuitos, renovados automáticamente.' },
  { icono: '🗄️', titulo: 'Base de datos incluida', desc: 'MySQL, PostgreSQL o MongoDB listos en un clic, sin instalación.' },
  { icono: '🔄', titulo: 'Alta disponibilidad', desc: 'Infraestructura Proxmox con redundancia y snapshots automáticos.' },
  { icono: '📦', titulo: 'Docker nativo', desc: 'Tus apps corren en contenedores aislados con Docker Compose.' },
  { icono: '🌐', titulo: 'Dominio flexible', desc: 'Usa nuestro subdominio gratuito o conecta tu propio dominio.' },
];

export default function Landing({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      {/* Navbar */}
      <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-indigo-400">▦</span>
            <span className="text-lg font-semibold text-white">CapuVPS</span>
          </div>
          <nav className="hidden items-center gap-8 md:flex">
            <a href="#planes" className="text-sm text-slate-400 hover:text-white transition-colors">Planes</a>
            <a href="#caracteristicas" className="text-sm text-slate-400 hover:text-white transition-colors">Características</a>
            <a href="#como-funciona" className="text-sm text-slate-400 hover:text-white transition-colors">Cómo funciona</a>
          </nav>
          <div className="flex items-center gap-3">
            <button onClick={onLogin}
              className="text-sm text-slate-300 hover:text-white transition-colors px-3 py-2 rounded-lg hover:bg-slate-800">
              Iniciar sesión
            </button>
            <a href={FOSSBILLING_URL}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition-colors">
              Contratar
            </a>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-indigo-950/40 to-slate-950 px-6 py-24 text-center">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(99,102,241,0.15)_0%,_transparent_70%)]" />
        <div className="relative mx-auto max-w-3xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-indigo-800/60 bg-indigo-900/30 px-4 py-1.5 text-xs font-medium text-indigo-300">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse" />
            Infraestructura Proxmox — Alta disponibilidad
          </div>
          <h1 className="mt-6 text-5xl font-bold leading-tight text-white md:text-6xl">
            Hosting gestionado<br />
            <span className="text-indigo-400">para tu aplicación</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-slate-400">
            Despliega cualquier app web, API o sitio estático en segundos. Sin configurar servidores. Con base de datos, HTTPS y dominio incluidos.
          </p>
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <a href={FOSSBILLING_URL}
              className="rounded-lg bg-indigo-600 px-8 py-3.5 text-base font-semibold text-white hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-900/40">
              Empezar gratis — desde $99 MXN/mes
            </a>
            <a href="#planes"
              className="rounded-lg border border-slate-700 px-8 py-3.5 text-base font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors">
              Ver todos los planes
            </a>
          </div>
          <p className="mt-4 text-xs text-slate-600">Sin tarjeta de crédito requerida para comenzar</p>
        </div>
      </section>

      {/* Stats strip */}
      <section className="border-y border-slate-800/60 bg-slate-900/40 px-6 py-8">
        <div className="mx-auto grid max-w-4xl grid-cols-2 gap-6 md:grid-cols-4">
          {[
            { val: '99.9%', label: 'Uptime garantizado' },
            { val: '< 5 min', label: 'Tiempo de deploy' },
            { val: '24/7', label: 'Monitoreo activo' },
            { val: '100%', label: 'Gestionado por nosotros' },
          ].map((s) => (
            <div key={s.label} className="text-center">
              <div className="text-2xl font-bold text-indigo-400">{s.val}</div>
              <div className="mt-1 text-xs text-slate-500">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Planes */}
      <section id="planes" className="px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold text-white">Planes y precios</h2>
            <p className="mt-3 text-slate-400">Precios en MXN por mes, sin costos ocultos</p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {PLANS.map((plan) => (
              <div key={plan.id} className={`relative rounded-2xl border p-8 transition-all ${
                plan.destacado
                  ? 'border-indigo-500 bg-indigo-950/50 shadow-xl shadow-indigo-900/30'
                  : 'border-slate-800 bg-slate-900/50 hover:border-slate-700'
              }`}>
                {plan.destacado && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-indigo-600 px-4 py-1 text-xs font-semibold text-white">
                    Más popular
                  </div>
                )}
                <h3 className="text-lg font-semibold text-white">{plan.nombre}</h3>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-white">{plan.precio}</span>
                  <span className="text-slate-400 text-sm">{plan.periodo}</span>
                </div>
                <a href={FOSSBILLING_URL}
                  className={`mt-6 block rounded-lg py-2.5 text-center text-sm font-semibold transition-colors ${
                    plan.destacado
                      ? 'bg-indigo-600 text-white hover:bg-indigo-500'
                      : 'border border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}>
                  {plan.id === 'empresarial' ? 'Contactar ventas' : 'Contratar ahora'}
                </a>
                <ul className="mt-6 space-y-3">
                  {plan.recursos.map((r) => (
                    <li key={r} className="flex items-start gap-2.5 text-sm text-slate-300">
                      <span className="mt-0.5 text-emerald-400 shrink-0">✓</span>
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Características */}
      <section id="caracteristicas" className="border-t border-slate-800/60 bg-slate-900/30 px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold text-white">Todo lo que necesitas, incluido</h2>
            <p className="mt-3 text-slate-400">Sin configuraciones complicadas ni extras escondidos</p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.titulo} className="rounded-xl border border-slate-800 bg-slate-900 p-6 hover:border-slate-700 transition-colors">
                <div className="mb-3 text-2xl">{f.icono}</div>
                <h3 className="font-semibold text-white">{f.titulo}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Cómo funciona */}
      <section id="como-funciona" className="px-6 py-20">
        <div className="mx-auto max-w-4xl">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold text-white">Cómo funciona</h2>
            <p className="mt-3 text-slate-400">De cero a producción en tres pasos</p>
          </div>
          <div className="relative grid gap-8 md:grid-cols-3">
            {PASOS.map((paso, i) => (
              <div key={paso.num} className="relative text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-950 border border-indigo-800/60">
                  <span className="text-2xl font-bold text-indigo-400">{paso.num}</span>
                </div>
                {i < PASOS.length - 1 && (
                  <div className="absolute top-8 left-[calc(50%+2rem)] hidden h-0.5 w-[calc(100%-4rem)] bg-gradient-to-r from-indigo-800/60 to-transparent md:block" />
                )}
                <h3 className="font-semibold text-white">{paso.titulo}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{paso.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Banner */}
      <section className="border-t border-slate-800/60 bg-indigo-950/30 px-6 py-16">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold text-white">¿Listo para empezar?</h2>
          <p className="mt-4 text-slate-400">
            Crea tu cuenta, elige un plan y despliega tu primera app en menos de 10 minutos.
          </p>
          <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <a href={FOSSBILLING_URL}
              className="rounded-lg bg-indigo-600 px-8 py-3.5 text-base font-semibold text-white hover:bg-indigo-500 transition-colors">
              Crear mi cuenta
            </a>
            <button onClick={onLogin}
              className="text-sm text-slate-400 hover:text-white transition-colors">
              Ya tengo cuenta — Iniciar sesión
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800/60 bg-slate-950 px-6 py-10">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col items-center gap-4 md:flex-row md:justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold text-indigo-400">▦</span>
              <span className="font-semibold text-white">CapuVPS</span>
              <span className="ml-2 text-xs text-slate-600">Hosting gestionado</span>
            </div>
            <div className="flex gap-6 text-xs text-slate-600">
              <a href={FOSSBILLING_URL} className="hover:text-slate-400 transition-colors">Portal de cliente</a>
              <button onClick={onLogin} className="hover:text-slate-400 transition-colors">Panel de control</button>
            </div>
            <p className="text-xs text-slate-700">&copy; 2026 CapuVPS. Todos los derechos reservados.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
