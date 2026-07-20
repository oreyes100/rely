const FOSSBILLING_URL = '/fossbilling/';

const AI_FEATURES = [
  {
    icon: '🔍',
    titulo: 'Detección automática de stack',
    desc: 'Analiza tu repositorio y elige la configuración Docker óptima. Node, PHP, Python, estático — sin escribir un Dockerfile.',
  },
  {
    icon: '🔒',
    titulo: 'HTTPS automático',
    desc: 'Certificados SSL gratuitos emitidos y renovados solos. Nunca más una advertencia de seguridad en tu sitio.',
  },
  {
    icon: '🗄️',
    titulo: 'Base de datos en un clic',
    desc: 'PostgreSQL, MySQL o MongoDB listos en segundos. URL de conexión configurada automáticamente en tu app.',
  },
  {
    icon: '♻️',
    titulo: 'Recuperación inteligente',
    desc: 'Si el build falla, el sistema detecta el problema exacto y te muestra el log real para que lo corrijas.',
  },
];

// Terminal animada — simula un deploy en vivo
function TerminalDeploy() {
  const lines = [
    { text: '$ git push origin main', delay: 0, color: '#b8a8f0' },
    { text: 'Pushing to github.com/tú/mi-app...', delay: 0.6, color: '#94a3b8' },
    { text: '✓ Push completado', delay: 1.2, color: '#4ade80' },
    { text: '', delay: 1.6, color: '' },
    { text: '▦ CapuVPS — Deploy automático iniciado', delay: 1.8, color: '#673de6' },
    { text: '[1/5] Clonando repositorio...  ✓ (3s)', delay: 2.8, color: '#94a3b8' },
    { text: '[2/5] Creando servidor VPS...  ✓ (4m 12s)', delay: 4.2, color: '#94a3b8' },
    { text: '[3/5] Instalando Docker...     ✓ (48s)', delay: 5.2, color: '#94a3b8' },
    { text: '[4/5] Construyendo imagen...   ✓ (1m 20s)', delay: 6.4, color: '#94a3b8' },
    { text: '[5/5] Activando HTTPS...       ✓ (8s)', delay: 7.4, color: '#94a3b8' },
    { text: '', delay: 7.8, color: '' },
    { text: '✓ ¡Tu app está en línea!', delay: 8.0, color: '#4ade80' },
    { text: '  https://mi-tienda.capuvps.duckdns.org', delay: 8.5, color: '#818cf8' },
    { text: '  Deploy completado en 6m 31s', delay: 9.0, color: '#64748b' },
  ];

  return (
    <div className="rounded-2xl border border-[#3d2d8a] bg-[#0f0a2a] p-5 shadow-2xl shadow-[#673de6]/20 font-mono text-sm overflow-hidden">
      {/* Barra de título */}
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-[#3d2d8a]">
        <span className="h-3 w-3 rounded-full bg-[#fc5185]" />
        <span className="h-3 w-3 rounded-full bg-[#ffcd35]" />
        <span className="h-3 w-3 rounded-full bg-[#4ade80]" />
        <span className="ml-2 text-xs text-[#673de6]">terminal — CapuVPS Deploy</span>
      </div>
      {/* Líneas animadas */}
      <div className="space-y-1.5 min-h-[260px]">
        {lines.map((line, i) => (
          <div
            key={i}
            style={{
              color: line.color || 'transparent',
              opacity: 0,
              animation: `termLine 0.3s ease forwards`,
              animationDelay: `${line.delay}s`,
            }}
            className="leading-snug whitespace-pre">
            {line.text || ' '}
          </div>
        ))}
      </div>
      {/* Cursor parpadeante */}
      <div style={{ color: '#673de6', animation: 'blink 1s step-end infinite', animationDelay: '9.5s', opacity: 0 }}>▋</div>
      <style>{`
        @keyframes termLine {
          from { opacity: 0; transform: translateX(-4px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0; }
        }
      `}</style>
    </div>
  );
}

const PLANS = [
  {
    id: 'basico',
    nombre: 'Básico',
    desc: 'Ideal para tu primer sitio web o app personal.',
    precioAntes: '$199',
    precio: '$99',
    descuento: '-50%',
    periodo: 'MXN/mes',
    destacado: false,
    recursos: [
      '1 vCPU · 1 GB RAM',
      '20 GB SSD NVMe',
      '1 proyecto activo',
      'Base de datos MySQL o PostgreSQL',
      'Subdominio gratis (tuapp.capuvps.duckdns.org)',
      'Certificado SSL gratis',
      'Deploy automático desde GitHub',
    ],
  },
  {
    id: 'estandar',
    nombre: 'Estándar',
    desc: 'Para negocios y proyectos en crecimiento.',
    precioAntes: '$499',
    precio: '$199',
    descuento: '-60%',
    periodo: 'MXN/mes',
    destacado: true,
    recursos: [
      '2 vCPU · 2 GB RAM',
      '25 GB SSD NVMe',
      '2 proyectos activos',
      'MySQL, PostgreSQL o MongoDB',
      'Dominio propio o subdominio gratis',
      'Certificado SSL gratis',
      'Deploy automático desde GitHub',
      'Soporte prioritario',
    ],
  },
  {
    id: 'empresarial',
    nombre: 'Empresarial',
    desc: 'Recursos dedicados y soporte a la medida.',
    precioAntes: null,
    precio: 'A la medida',
    descuento: null,
    periodo: '',
    destacado: false,
    recursos: [
      'vCPU y RAM configurables',
      'Almacenamiento a la medida',
      'Proyectos ilimitados',
      'Multi-base de datos + Redis',
      'Dominio propio + DNS administrado',
      'SLA dedicado',
      'Soporte 24/7',
    ],
  },
];

const FEATURES = [
  { titulo: 'Deploy en minutos', desc: 'De cero a producción en menos de 5 minutos. Sube tu código o conecta GitHub y listo.' },
  { titulo: 'HTTPS automático', desc: 'Certificados SSL gratuitos que se renuevan solos. Tu sitio siempre seguro.' },
  { titulo: 'Base de datos incluida', desc: 'MySQL, PostgreSQL o MongoDB listos en un clic, sin instalar nada.' },
  { titulo: 'Servidores propios', desc: 'Infraestructura Proxmox con redundancia, snapshots y monitoreo 24/7.' },
  { titulo: 'Docker nativo', desc: 'Tus apps corren aisladas en contenedores. Cualquier stack: Node, PHP, Python, estático.' },
  { titulo: 'Dominio flexible', desc: 'Subdominio gratis, tu dominio DuckDNS o tu dominio propio con DNS.' },
];

const PASOS = [
  { num: '1', titulo: 'Crea tu cuenta', desc: 'Contrata tu plan y recibe por correo tu código de acceso al panel.' },
  { num: '2', titulo: 'Sube tu proyecto', desc: 'Conecta tu repositorio de GitHub, sube un ZIP o usa una plantilla.' },
  { num: '3', titulo: 'Tu app está en línea', desc: 'Nosotros creamos el servidor, la base de datos, el dominio y el SSL.' },
];

const Check = () => (
  <svg className="mt-0.5 h-5 w-5 shrink-0 text-[#673de6]" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-7 7a1 1 0 01-1.4 0l-3-3a1 1 0 111.4-1.4l2.3 2.29 6.3-6.3a1 1 0 011.4 0z" clipRule="evenodd" />
  </svg>
);

export default function Landing({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="min-h-screen bg-white font-sans text-[#1d1e20]">
      {/* Barra de oferta */}
      <div className="bg-[#2f1c6a] px-4 py-2.5 text-center text-sm text-white">
        <span className="font-semibold">Oferta de lanzamiento:</span>{' '}
        hasta <span className="font-bold text-[#ffcd35]">60% de descuento</span> en todos los planes
        <a href="#planes" className="ml-3 rounded-full bg-white/15 px-3 py-0.5 text-xs font-semibold hover:bg-white/25 transition-colors">
          Ver ofertas →
        </a>
      </div>

      {/* Navbar */}
      <header className="sticky top-0 z-50 border-b border-gray-100 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-[#673de6]">▦</span>
            <span className="text-xl font-bold tracking-tight text-[#2f1c6a]">CapuVPS</span>
          </div>
          <nav className="hidden items-center gap-8 lg:flex">
            <a href="#planes" className="text-sm font-medium text-gray-600 hover:text-[#673de6] transition-colors">Planes y precios</a>
            <a href="#caracteristicas" className="text-sm font-medium text-gray-600 hover:text-[#673de6] transition-colors">Características</a>
            <a href="#como-funciona" className="text-sm font-medium text-gray-600 hover:text-[#673de6] transition-colors">Cómo funciona</a>
          </nav>
          <div className="flex items-center gap-3">
            <button onClick={onLogin}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-[#1d1e20] hover:border-[#673de6] hover:text-[#673de6] transition-colors">
              Iniciar sesión
            </button>
            <a href={FOSSBILLING_URL}
              className="rounded-lg bg-[#673de6] px-5 py-2 text-sm font-semibold text-white hover:bg-[#5025d1] transition-colors">
              Empieza ahora
            </a>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-gradient-to-b from-[#f4f0ff] to-white px-6 pb-20 pt-16">
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
          <div>
            <h1 className="text-4xl font-extrabold leading-tight tracking-tight text-[#1d1e20] md:text-5xl">
              Hosting para tu app<br />sin complicaciones
            </h1>
            <ul className="mt-8 space-y-3">
              {['Servidor, base de datos, dominio y SSL en un solo clic',
                'Deploy desde GitHub, ZIP o plantilla en menos de 5 minutos',
                'Soporte en español y garantía de 30 días'].map((t) => (
                <li key={t} className="flex items-start gap-3 text-gray-700"><Check />{t}</li>
              ))}
            </ul>
            <div className="mt-8 flex items-baseline gap-3">
              <span className="text-lg text-gray-400 line-through">$199</span>
              <span className="text-5xl font-extrabold text-[#2f1c6a]">$99</span>
              <span className="text-gray-500">MXN/mes</span>
              <span className="rounded-md bg-[#fc5185]/10 px-2 py-1 text-sm font-bold text-[#fc5185]">-50%</span>
            </div>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
              <a href={FOSSBILLING_URL}
                className="rounded-lg bg-[#673de6] px-10 py-4 text-center text-base font-bold text-white hover:bg-[#5025d1] transition-colors">
                Empieza ahora
              </a>
              <span className="text-sm text-gray-500">✓ Garantía de reembolso de 30 días</span>
            </div>
          </div>

          {/* Terminal animada (demo deploy en vivo) */}
          <div className="hidden lg:block">
            <TerminalDeploy />
            <p className="mt-3 text-center text-xs text-gray-400">Deploy real · de git push a HTTPS en minutos</p>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-gray-100 bg-white px-6 py-10">
        <div className="mx-auto grid max-w-4xl grid-cols-2 gap-8 md:grid-cols-4">
          {[
            { val: '99.9%', label: 'Uptime garantizado' },
            { val: '<5 min', label: 'De cero a producción' },
            { val: '24/7', label: 'Monitoreo activo' },
            { val: '30 días', label: 'Garantía de reembolso' },
          ].map((s) => (
            <div key={s.label} className="text-center">
              <div className="text-3xl font-extrabold text-[#673de6]">{s.val}</div>
              <div className="mt-1 text-sm text-gray-500">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Planes */}
      <section id="planes" className="bg-[#fafbff] px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-extrabold tracking-tight text-[#1d1e20] md:text-4xl">Elige tu plan</h2>
            <p className="mt-3 text-gray-500">Todos incluyen servidor, base de datos, dominio y SSL. Precios en MXN.</p>
          </div>
          <div className="grid items-start gap-6 md:grid-cols-3">
            {PLANS.map((plan) => (
              <div key={plan.id} className={`relative rounded-2xl bg-white p-8 ${
                plan.destacado
                  ? 'border-2 border-[#673de6] shadow-xl shadow-[#673de6]/10'
                  : 'border border-gray-200'
              }`}>
                {plan.destacado && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-[#673de6] px-4 py-1 text-xs font-bold uppercase tracking-wide text-white">
                    Más popular
                  </div>
                )}
                <h3 className="text-xl font-bold text-[#1d1e20]">{plan.nombre}</h3>
                <p className="mt-1 text-sm text-gray-500">{plan.desc}</p>
                <div className="mt-6 flex items-baseline gap-2">
                  {plan.precioAntes && <span className="text-gray-400 line-through">{plan.precioAntes}</span>}
                  <span className="text-4xl font-extrabold text-[#2f1c6a]">{plan.precio}</span>
                  {plan.periodo && <span className="text-sm text-gray-500">{plan.periodo}</span>}
                  {plan.descuento && (
                    <span className="rounded-md bg-[#fc5185]/10 px-2 py-0.5 text-xs font-bold text-[#fc5185]">{plan.descuento}</span>
                  )}
                </div>
                <a href={FOSSBILLING_URL}
                  className={`mt-6 block rounded-lg py-3 text-center text-sm font-bold transition-colors ${
                    plan.destacado
                      ? 'bg-[#673de6] text-white hover:bg-[#5025d1]'
                      : 'border-2 border-[#673de6] text-[#673de6] hover:bg-[#673de6] hover:text-white'
                  }`}>
                  {plan.id === 'empresarial' ? 'Contactar ventas' : 'Contratar plan'}
                </a>
                <ul className="mt-6 space-y-3 border-t border-gray-100 pt-6">
                  {plan.recursos.map((r) => (
                    <li key={r} className="flex items-start gap-2.5 text-sm text-gray-700"><Check />{r}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-8 text-center text-sm text-gray-400">
            ¿Ya tienes cuenta?{' '}
            <button onClick={onLogin} className="font-semibold text-[#673de6] hover:underline">Administra tus proyectos aquí</button>
          </p>
        </div>
      </section>

      {/* Características */}
      <section id="caracteristicas" className="bg-white px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-extrabold tracking-tight text-[#1d1e20] md:text-4xl">Todo incluido, sin extras escondidos</h2>
            <p className="mt-3 text-gray-500">Lo que otros cobran aparte, aquí viene con tu plan.</p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.titulo} className="rounded-2xl border border-gray-200 bg-white p-6 hover:border-[#673de6]/40 hover:shadow-lg hover:shadow-[#673de6]/5 transition-all">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[#f4f0ff]">
                  <Check />
                </div>
                <h3 className="font-bold text-[#1d1e20]">{f.titulo}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-500">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Automatización inteligente */}
      <section className="bg-[#2f1c6a] px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 text-center">
            <span className="inline-block rounded-full bg-[#673de6]/30 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-[#b8a8f0] mb-4">
              Automatización inteligente
            </span>
            <h2 className="text-3xl font-extrabold tracking-tight text-white md:text-4xl">
              Tu infraestructura,<br />en piloto automático
            </h2>
            <p className="mt-3 text-[#b8a8f0]">
              El sistema hace el trabajo pesado. Tú solo subes tu código.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {AI_FEATURES.map((f) => (
              <div key={f.titulo} className="rounded-2xl border border-[#673de6]/30 bg-white/5 p-6 hover:bg-white/10 transition-all">
                <div className="mb-4 text-3xl">{f.icon}</div>
                <h3 className="font-bold text-white">{f.titulo}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#b8a8f0]">{f.desc}</p>
              </div>
            ))}
          </div>
          {/* Mini demo interactiva */}
          <div className="mt-12 rounded-2xl border border-[#673de6]/40 bg-black/30 p-6">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex-1 min-w-[200px]">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#b8a8f0] mb-1">Stack detectado automáticamente</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {['Node.js', 'React', 'Next.js', 'PHP', 'Python', 'Static'].map((t) => (
                    <span key={t} className="rounded-full border border-[#673de6]/40 px-3 py-1 text-xs text-[#b8a8f0]">{t}</span>
                  ))}
                </div>
              </div>
              <div className="flex-1 min-w-[200px]">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#b8a8f0] mb-1">Base de datos automática</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {['PostgreSQL', 'MySQL', 'MongoDB'].map((db) => (
                    <span key={db} className="rounded-full bg-[#673de6]/20 px-3 py-1 text-xs text-[#b8a8f0]">{db}</span>
                  ))}
                </div>
              </div>
              <div className="flex-1 min-w-[200px]">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#b8a8f0] mb-1">HTTPS en segundos</p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-[#4ade80] text-sm">🔒</span>
                  <span className="font-mono text-xs text-[#4ade80]">https://tuapp.capuvps.duckdns.org</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Cómo funciona */}
      <section id="como-funciona" className="bg-[#fafbff] px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-extrabold tracking-tight text-[#1d1e20] md:text-4xl">En línea en 3 pasos</h2>
          </div>
          <div className="grid gap-8 md:grid-cols-3">
            {PASOS.map((paso) => (
              <div key={paso.num} className="rounded-2xl bg-white border border-gray-200 p-8 text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#673de6] text-xl font-extrabold text-white">
                  {paso.num}
                </div>
                <h3 className="font-bold text-[#1d1e20]">{paso.titulo}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-500">{paso.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Garantía */}
      <section className="bg-white px-6 py-14">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 rounded-2xl border border-[#00b090]/30 bg-[#00b090]/5 px-8 py-10 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#00b090]/10 text-2xl font-extrabold text-[#00b090]">30</span>
          <h3 className="text-xl font-bold text-[#1d1e20]">Garantía de reembolso de 30 días</h3>
          <p className="max-w-md text-sm text-gray-500">
            Prueba cualquier plan sin riesgo. Si no te convence, te devolvemos tu dinero durante los primeros 30 días. Sin preguntas.
          </p>
        </div>
      </section>

      {/* CTA final */}
      <section className="bg-[#2f1c6a] px-6 py-16">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-extrabold text-white md:text-4xl">Lanza tu proyecto hoy</h2>
          <p className="mt-4 text-[#b8a8f0]">
            Desde <span className="font-bold text-[#ffcd35]">$99 MXN/mes</span> con todo incluido. Tu app en línea en menos de 10 minutos.
          </p>
          <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <a href={FOSSBILLING_URL}
              className="rounded-lg bg-[#ffcd35] px-10 py-4 text-base font-bold text-[#2f1c6a] hover:bg-[#ffd85c] transition-colors">
              Crear mi cuenta
            </a>
            <button onClick={onLogin} className="text-sm font-semibold text-white/80 hover:text-white transition-colors">
              Ya tengo cuenta → Administrar
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 bg-white px-6 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 md:flex-row md:justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold text-[#673de6]">▦</span>
            <span className="font-bold text-[#2f1c6a]">CapuVPS</span>
            <span className="ml-2 text-xs text-gray-400">Hosting gestionado</span>
          </div>
          <div className="flex gap-6 text-sm text-gray-500">
            <a href={FOSSBILLING_URL} className="hover:text-[#673de6] transition-colors">Crear cuenta</a>
            <a href={FOSSBILLING_URL} className="hover:text-[#673de6] transition-colors">Facturación</a>
            <button onClick={onLogin} className="hover:text-[#673de6] transition-colors">Administrar proyectos</button>
          </div>
          <p className="text-xs text-gray-400">&copy; 2026 CapuVPS. Todos los derechos reservados.</p>
        </div>
      </footer>
    </div>
  );
}
