import { useState } from 'react';
import { useNodes } from '../api/queries';

export default function ProxmoxConsole() {
  const { data: nodes } = useNodes();
  const [selected, setSelected] = useState<string | null>(null);
  const [iframeKey, setIframeKey] = useState(0);

  const nodeName = selected ?? nodes?.[0]?.name;
  const node = nodes?.find((n) => n.name === nodeName);
  const proxyUrl = nodeName ? `/proxmox/${nodeName}/` : null;
  const directUrl = node ? `https://${node.host}:8006/` : null;

  return (
    // El contenedor ocupa toda la altura disponible (pantalla – barra nav)
    <div className="flex flex-col" style={{ height: 'calc(100vh - 6rem)' }}>
      {/* Barra de controles */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="mr-1 text-base font-semibold">Consola Proxmox</h2>

        {/* Selector de nodo */}
        <div className="flex gap-1">
          {nodes?.map((n) => (
            <button
              key={n.name}
              onClick={() => {
                setSelected(n.name);
                setIframeKey((k) => k + 1);
              }}
              className={`btn text-xs ${
                nodeName === n.name ? 'btn-primary' : 'btn-ghost'
              } ${!n.online ? 'opacity-50' : ''}`}
            >
              {n.name}
              <span
                className={`ml-1.5 inline-block h-2 w-2 rounded-full ${
                  n.online ? 'bg-emerald-400' : 'bg-red-400'
                }`}
              />
            </button>
          ))}
        </div>

        <div className="ml-auto flex gap-1">
          <button
            className="btn-ghost text-xs"
            onClick={() => setIframeKey((k) => k + 1)}
            title="Recargar el iframe"
          >
            ↺ Recargar
          </button>
          {directUrl && (
            <a
              href={directUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost text-xs"
              title="Abrir Proxmox directamente en una pestaña nueva"
            >
              ↗ Pestaña nueva
            </a>
          )}
        </div>
      </div>

      {/* iframe principal */}
      {proxyUrl ? (
        <iframe
          key={iframeKey}
          src={proxyUrl}
          className="min-h-0 flex-1 w-full rounded-lg border border-slate-700 bg-slate-900"
          title={`Proxmox ${nodeName}`}
          // allow-same-origin necesario para que las cookies de Proxmox funcionen
          // allow-top-navigation-by-user-activation permite abrir noVNC como ventana
          sandbox="allow-forms allow-modals allow-pointer-lock allow-popups allow-same-origin allow-scripts allow-top-navigation-by-user-activation"
          allow="clipboard-read; clipboard-write; fullscreen"
        />
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-slate-500">Cargando nodos…</p>
        </div>
      )}

      {/* Nota informativa */}
      <p className="mt-1.5 text-xs text-slate-600">
        El iframe carga la UI de Proxmox a través del proxy del backend (sin{' '}
        <code>X-Frame-Options</code>). Inicia sesión con tus credenciales de Proxmox
        — son distintas a las del panel. Si la consola VNC no abre en el iframe,
        usa <em>↗ Pestaña nueva</em>.
      </p>
    </div>
  );
}
