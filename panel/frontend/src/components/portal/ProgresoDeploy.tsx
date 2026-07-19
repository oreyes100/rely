import type { ProyectoPortal } from '../../api/types';

const ICON = {
  listo: '✓',
  'en progreso': '◌',
  error: '✗',
  pendiente: '·',
};

const COLOR = {
  listo: 'text-emerald-400',
  'en progreso': 'text-indigo-400 animate-pulse',
  error: 'text-red-400',
  pendiente: 'text-slate-500',
};

export default function ProgresoDeploy({ proyecto }: { proyecto: ProyectoPortal }) {
  return (
    <div className="space-y-3">
      {/* Steps */}
      <ol className="space-y-1.5">
        {proyecto.pasos.map((paso, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className={`mt-0.5 w-4 shrink-0 text-center font-mono text-sm ${COLOR[paso.estado]}`}>
              {ICON[paso.estado]}
            </span>
            <div className="min-w-0">
              <p className={`text-sm ${paso.estado === 'pendiente' ? 'text-slate-500' : 'text-slate-200'}`}>
                {paso.etiqueta}
              </p>
              {paso.mensaje && (
                <p className="mt-0.5 text-xs text-red-400 break-all">{paso.mensaje}</p>
              )}
            </div>
          </li>
        ))}
      </ol>

      {/* URL when done */}
      {proyecto.estado === 'activo' && proyecto.url && (
        <a href={proyecto.url} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-lg bg-emerald-800/30 px-3 py-2 text-sm text-emerald-300 hover:bg-emerald-800/50 transition-colors">
          Abrir sitio web →
        </a>
      )}

      {/* DB info */}
      {proyecto.db && (
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3 space-y-1">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Base de datos ({proyecto.db.tipo})</p>
          {proyecto.db.usuario && <Row label="Usuario" value={proyecto.db.usuario} />}
          {proyecto.db.password && <Row label="Contraseña" value={proyecto.db.password} mono />}
          {proyecto.db.nombre && <Row label="Base de datos" value={proyecto.db.nombre} />}
          {proyecto.db.urlConexion && <Row label="URL (interna)" value={proyecto.db.urlConexion} mono />}
          {proyecto.db.nota && <p className="text-xs text-slate-500 italic mt-1">{proyecto.db.nota}</p>}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-2 text-xs">
      <span className="w-24 shrink-0 text-slate-500">{label}:</span>
      <span className={`break-all text-slate-200 ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}
