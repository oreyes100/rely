import { useState } from 'react';
import { api } from '../../api/client';

type Paso = 1 | 2 | 3 | 4 | 5;
type TipoFuente = 'plantilla' | 'git';
type TipoDB = 'ninguna' | 'postgres' | 'mysql' | 'mongo';
type TipoDominio = 'plataforma' | 'duckdns' | 'propio';

interface Campos {
  negocio: string; descripcion: string; color: string; whatsapp: string; eslogan: string;
}

export default function NuevoProyecto({ onCreado, onCancelar }: { onCreado: () => void; onCancelar: () => void }) {
  const [paso, setPaso] = useState<Paso>(1);
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<TipoFuente>('plantilla');
  const [gitUrl, setGitUrl] = useState('');
  const [campos, setCampos] = useState<Campos>({ negocio: '', descripcion: '', color: '#4f46e5', whatsapp: '', eslogan: '' });
  const [db, setDb] = useState<TipoDB>('ninguna');
  const [variables, setVariables] = useState('');
  const [tipoDominio, setTipoDominio] = useState<TipoDominio>('plataforma');
  const [dominioFqdn, setDominioFqdn] = useState('');
  const [duckdnsNombre, setDuckdnsNombre] = useState('');
  const [duckdnsToken, setDuckdnsToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const nombreValido = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(nombre);

  async function enviar() {
    setBusy(true); setError(null);
    try {
      let dominio: Record<string, string> = { tipo: tipoDominio };
      if (tipoDominio === 'propio') dominio.fqdn = dominioFqdn;
      if (tipoDominio === 'duckdns') { dominio.nombre = duckdnsNombre; dominio.token = duckdnsToken; }

      await api('/portal/projects', {
        method: 'POST',
        body: JSON.stringify({
          nombre, tipo, gitUrl: tipo === 'git' ? gitUrl : undefined,
          campos: tipo === 'plantilla' ? campos : undefined,
          db, dominio,
          variables: variables.trim() || undefined,
        }),
      });
      onCreado();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear el proyecto');
      setBusy(false);
    }
  }

  function siguiente() {
    setError(null);
    if (paso === 1 && !nombreValido) { setError('El nombre debe tener 3-30 caracteres: letras minúsculas, números o guiones'); return; }
    if (paso === 2 && tipo === 'git' && !/^https?:\/\//.test(gitUrl)) { setError('Ingresa una URL de repositorio pública (https://)'); return; }
    if (paso === 2 && tipo === 'plantilla' && !campos.negocio) { setError('El nombre del negocio es obligatorio'); return; }
    if (paso === 4 && tipoDominio === 'propio' && !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(dominioFqdn)) { setError('Dominio inválido (ej: misitio.com)'); return; }
    if (paso === 4 && tipoDominio === 'duckdns' && !duckdnsNombre) { setError('Ingresa el nombre de tu subdominio DuckDNS'); return; }
    if (paso === 5) { enviar(); return; }
    setPaso((p) => (p + 1) as Paso);
  }

  const PASOS = ['Nombre', 'Código fuente', 'Base de datos', 'Dominio', 'Confirmar'];

  return (
    <div className="max-w-xl">
      {/* Indicador de pasos */}
      <div className="mb-6 flex gap-1">
        {PASOS.map((label, i) => (
          <div key={i} className="flex-1">
            <div className={`h-1.5 rounded-full transition-colors ${i + 1 <= paso ? 'bg-indigo-500' : 'bg-slate-700'}`} />
            <p className={`mt-1 text-center text-xs ${i + 1 === paso ? 'text-indigo-400' : 'text-slate-600'}`}>{label}</p>
          </div>
        ))}
      </div>

      <div className="card space-y-5">
        {/* Paso 1: Nombre */}
        {paso === 1 && (
          <>
            <div>
              <h3 className="text-base font-semibold text-slate-100 mb-1">Nombre del proyecto</h3>
              <p className="text-sm text-slate-400">Será parte de la dirección de tu sitio (ej: <code className="font-mono text-indigo-300">mi-tienda</code>)</p>
            </div>
            <div>
              <label className="label" htmlFor="pnombre">Nombre del proyecto</label>
              <input id="pnombre" type="text" className="input font-mono" value={nombre} autoFocus
                onChange={(e) => setNombre(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder="mi-tienda" />
              <p className="mt-1 text-xs text-slate-500">Solo letras minúsculas, números y guiones. Mínimo 3 caracteres.</p>
            </div>
          </>
        )}

        {/* Paso 2: Fuente */}
        {paso === 2 && (
          <>
            <div>
              <h3 className="text-base font-semibold text-slate-100 mb-1">¿Cómo deseas publicar tu sitio?</h3>
            </div>
            <div className="flex gap-2">
              {([['plantilla', 'Usar plantilla', 'Sitio de negocio listo, solo llena los datos'],
                ['git', 'Código propio', 'Tengo un repositorio de GitHub/GitLab']] as [TipoFuente, string, string][]).map(([t, label, desc]) => (
                <button key={t} onClick={() => setTipo(t)}
                  className={`flex-1 rounded-lg border p-3 text-left transition-colors ${tipo === t ? 'border-indigo-500 bg-indigo-900/20' : 'border-slate-700 hover:border-slate-600'}`}>
                  <p className={`text-sm font-medium ${tipo === t ? 'text-indigo-300' : 'text-slate-200'}`}>{label}</p>
                  <p className="mt-1 text-xs text-slate-500">{desc}</p>
                </button>
              ))}
            </div>

            {tipo === 'plantilla' && (
              <div className="space-y-3">
                <div>
                  <label className="label" htmlFor="neg">Nombre del negocio *</label>
                  <input id="neg" type="text" className="input" value={campos.negocio} autoFocus
                    onChange={(e) => setCampos({ ...campos, negocio: e.target.value })} placeholder="Ej: Tacos El Compadre" />
                </div>
                <div>
                  <label className="label" htmlFor="eslogan">Eslogan o frase</label>
                  <input id="eslogan" type="text" className="input" value={campos.eslogan}
                    onChange={(e) => setCampos({ ...campos, eslogan: e.target.value })} placeholder="Los mejores tacos del norte" />
                </div>
                <div>
                  <label className="label" htmlFor="desc">Descripción breve</label>
                  <textarea id="desc" className="input resize-none" rows={3} value={campos.descripcion}
                    onChange={(e) => setCampos({ ...campos, descripcion: e.target.value })}
                    placeholder="Descripción de tu negocio o servicio…" />
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="label" htmlFor="wa">WhatsApp (opcional)</label>
                    <input id="wa" type="tel" className="input" value={campos.whatsapp}
                      onChange={(e) => setCampos({ ...campos, whatsapp: e.target.value })} placeholder="5212345678901" />
                  </div>
                  <div>
                    <label className="label" htmlFor="color">Color principal</label>
                    <input id="color" type="color" className="h-10 w-16 cursor-pointer rounded-lg border border-slate-600 bg-slate-800 p-1"
                      value={campos.color} onChange={(e) => setCampos({ ...campos, color: e.target.value })} />
                  </div>
                </div>
              </div>
            )}

            {tipo === 'git' && (
              <div className="space-y-3">
                <div>
                  <label className="label" htmlFor="giturl">URL del repositorio público</label>
                  <input id="giturl" type="url" className="input font-mono" value={gitUrl} autoFocus
                    onChange={(e) => setGitUrl(e.target.value.trim())} placeholder="https://github.com/usuario/mi-proyecto" />
                  <p className="mt-1 text-xs text-slate-500">El repositorio debe ser público. Detectamos automáticamente el tipo de proyecto (Node.js, Docker, etc.)</p>
                </div>
                <div>
                  <label className="label" htmlFor="envvars">Variables de entorno (opcional)</label>
                  <textarea id="envvars" className="input resize-none font-mono text-xs" rows={4} value={variables}
                    onChange={(e) => setVariables(e.target.value)}
                    placeholder={'NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co\nNEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci…'} />
                  <p className="mt-1 text-xs text-slate-500">Una por línea, formato <code className="text-indigo-300">NOMBRE=valor</code>. Si tu app usa servicios externos (Supabase, Stripe, APIs), agrégalas aquí — se usan al construir y al ejecutar tu app.</p>
                </div>
              </div>
            )}
          </>
        )}

        {/* Paso 3: Base de datos */}
        {paso === 3 && (
          <>
            <div>
              <h3 className="text-base font-semibold text-slate-100 mb-1">Base de datos</h3>
              <p className="text-sm text-slate-400">Elige si tu aplicación necesita una base de datos. Se configurará automáticamente.</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {([
                ['ninguna', 'Sin base de datos', 'Sitio estático o con datos externos'],
                ['postgres', 'PostgreSQL', 'Base de datos relacional (recomendada)'],
                ['mysql', 'MySQL / MariaDB', 'Alternativa SQL ampliamente usada'],
                ['mongo', 'MongoDB', 'Base de datos NoSQL / documentos'],
              ] as [TipoDB, string, string][]).map(([t, label, desc]) => (
                <button key={t} onClick={() => setDb(t)}
                  className={`rounded-lg border p-3 text-left transition-colors ${db === t ? 'border-indigo-500 bg-indigo-900/20' : 'border-slate-700 hover:border-slate-600'}`}>
                  <p className={`text-sm font-medium ${db === t ? 'text-indigo-300' : 'text-slate-200'}`}>{label}</p>
                  <p className="mt-1 text-xs text-slate-500">{desc}</p>
                </button>
              ))}
            </div>
          </>
        )}

        {/* Paso 4: Dominio */}
        {paso === 4 && (
          <>
            <div>
              <h3 className="text-base font-semibold text-slate-100 mb-1">Dirección web</h3>
              <p className="text-sm text-slate-400">¿Cómo quieres que se acceda a tu sitio?</p>
            </div>
            <div className="space-y-2">
              {([
                ['plataforma', 'Subdominio de la plataforma', 'Tu sitio tendrá una dirección automática (sin configuración adicional)', null],
                ['duckdns', 'Subdominio DuckDNS gratuito', 'Usa tu propio nombre en duckdns.org (gratis)', null],
                ['propio', 'Dominio propio', 'Tienes tu propio dominio (ej: misitio.com)', null],
              ] as [TipoDominio, string, string, null][]).map(([t, label, desc]) => (
                <button key={t} onClick={() => setTipoDominio(t)}
                  className={`w-full rounded-lg border p-3 text-left transition-colors ${tipoDominio === t ? 'border-indigo-500 bg-indigo-900/20' : 'border-slate-700 hover:border-slate-600'}`}>
                  <p className={`text-sm font-medium ${tipoDominio === t ? 'text-indigo-300' : 'text-slate-200'}`}>{label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
                </button>
              ))}
            </div>
            {tipoDominio === 'propio' && (
              <div>
                <label className="label" htmlFor="fqdn">Tu dominio</label>
                <input id="fqdn" type="text" className="input font-mono" value={dominioFqdn}
                  onChange={(e) => setDominioFqdn(e.target.value.toLowerCase().trim())} placeholder="misitio.com" />
                <p className="mt-1 text-xs text-slate-500">Deberás apuntar el DNS de tu dominio a nuestra IP. Te daremos las instrucciones una vez creado el proyecto.</p>
              </div>
            )}
            {tipoDominio === 'duckdns' && (
              <div className="space-y-3">
                <div>
                  <label className="label" htmlFor="ddname">Nombre en DuckDNS</label>
                  <input id="ddname" type="text" className="input font-mono" value={duckdnsNombre}
                    onChange={(e) => setDuckdnsNombre(e.target.value.toLowerCase().trim())} placeholder="mi-nombre" />
                  <p className="text-xs text-slate-500 mt-0.5">Tu sitio quedará en: <code className="text-indigo-300">{duckdnsNombre || 'mi-nombre'}.duckdns.org</code></p>
                </div>
                <div>
                  <label className="label" htmlFor="ddtoken">Token de DuckDNS</label>
                  <input id="ddtoken" type="password" className="input font-mono" value={duckdnsToken}
                    onChange={(e) => setDuckdnsToken(e.target.value.trim())} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
                  <p className="text-xs text-slate-500 mt-0.5">Lo encuentras en tu cuenta de <a href="https://www.duckdns.org" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">duckdns.org</a></p>
                </div>
              </div>
            )}
          </>
        )}

        {/* Paso 5: Confirmación */}
        {paso === 5 && (
          <>
            <div>
              <h3 className="text-base font-semibold text-slate-100 mb-1">Confirmar y crear</h3>
              <p className="text-sm text-slate-400">Revisa los detalles antes de crear tu proyecto. El proceso tardará entre 5 y 15 minutos.</p>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3 space-y-2 text-sm">
              <ResumenRow label="Proyecto" value={nombre} mono />
              <ResumenRow label="Tipo" value={tipo === 'plantilla' ? 'Plantilla de negocio' : `Repositorio Git (${gitUrl})`} />
              <ResumenRow label="Base de datos" value={db === 'ninguna' ? 'Sin base de datos' : db} />
              <ResumenRow label="Dominio" value={
                tipoDominio === 'plataforma' ? 'Subdominio de la plataforma' :
                tipoDominio === 'duckdns' ? `${duckdnsNombre}.duckdns.org` :
                dominioFqdn
              } />
            </div>
            <p className="text-xs text-slate-500">Al confirmar, recibirás actualizaciones en tiempo real del progreso del despliegue.</p>
          </>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex gap-2 pt-2">
          {paso > 1 && (
            <button onClick={() => { setPaso((p) => (p - 1) as Paso); setError(null); }} className="btn-secondary" disabled={busy}>
              Atrás
            </button>
          )}
          <button onClick={onCancelar} className="btn-secondary ml-auto" disabled={busy}>Cancelar</button>
          <button onClick={siguiente} className="btn-primary" disabled={busy}>
            {busy ? 'Creando…' : paso === 5 ? 'Crear proyecto' : 'Siguiente →'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ResumenRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-2">
      <span className="w-28 shrink-0 text-slate-500">{label}:</span>
      <span className={`text-slate-200 ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}
