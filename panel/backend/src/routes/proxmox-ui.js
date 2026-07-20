import { createProxyMiddleware, responseInterceptor } from 'http-proxy-middleware';
import { config } from '../config.js';

// Script minificado que se inyecta en cada HTML de Proxmox.
// Intercepta fetch() y XHR para que las rutas absolutas (/api2/..., /pve-manager/...)
// pasen por el prefijo del proxy (/proxmox/<nodo>) en vez de ir directo al panel.
function interceptorScript(basePath) {
  return (
    `<script>(function(){` +
    `var B='${basePath}';` +
    `var _f=window.fetch;` +
    `window.fetch=function(u,o){` +
    `  if(typeof u==='string'&&u[0]==='/'&&u.indexOf(B)!==0)u=B+u;` +
    `  return _f.call(this,u,o);` +
    `};` +
    `var _x=XMLHttpRequest.prototype.open;` +
    `XMLHttpRequest.prototype.open=function(){` +
    `  var a=Array.from(arguments);` +
    `  if(typeof a[1]==='string'&&a[1][0]==='/'&&a[1].indexOf(B)!==0)a[1]=B+a[1];` +
    `  return _x.apply(this,a);` +
    `};` +
    `})()</script>`
  );
}

function createNodeProxy(node) {
  const mountPath = `/proxmox/${node.name}`;
  const script = interceptorScript(mountPath);

  const proxy = createProxyMiddleware({
    target: `https://${node.host}:${node.port || 8006}`,
    changeOrigin: true,
    secure: false,                  // cert auto-firmado en los nodos
    selfHandleResponse: true,       // necesario para responseInterceptor
    on: {
      proxyRes: responseInterceptor(async (responseBuffer, proxyRes, req, res) => {
        // Eliminar cabeceras que bloquean el iframe (tanto de proxyRes como de res)
        for (const h of ['x-frame-options', 'content-security-policy']) {
          delete proxyRes.headers[h];
          res.removeHeader(h);
        }

        // Reescribir Location header en redirects (Proxmox redirige con paths absolutos)
        if (proxyRes.headers['location']) {
          const loc = proxyRes.headers['location'];
          if (loc.startsWith('/') && !loc.startsWith(mountPath)) {
            const newLoc = mountPath + loc;
            proxyRes.headers['location'] = newLoc;
            res.setHeader('location', newLoc);
          }
        }

        // Inyectar el interceptor JS solo en respuestas HTML
        const ct = (proxyRes.headers['content-type'] || '').toLowerCase();
        if (ct.includes('text/html')) {
          let html = responseBuffer.toString('utf8');
          if (html.includes('</head>')) {
            html = html.replace('</head>', script + '</head>');
          } else if (html.includes('<body')) {
            html = html.replace(/<body[^>]*>/, (m) => m + script);
          } else {
            html = script + html;
          }

          // Reescribir src/href/action absolutos para que pasen por el proxy.
          // Esto carga los JS/CSS estáticos de Proxmox a través de /proxmox/<nodo>/pve2/...
          // en vez de pedirlos al panel (que devolvería index.html en su lugar).
          html = html.replace(
            /((?:src|href|action|data-src)=["'])(\/(?!\/)[^"']*)(["'])/g,
            (match, attr, urlPath, quote) => {
              if (urlPath.startsWith(mountPath)) return match;
              return `${attr}${mountPath}${urlPath}${quote}`;
            }
          );

          return Buffer.from(html, 'utf8');
        }

        return responseBuffer;
      }),
      error: (err, req, res) => {
        console.warn(`[proxmox-ui] ${node.name}: ${err.message}`);
        if (typeof res.status === 'function' && !res.headersSent) {
          res.status(502).send(
            `<p style="font-family:sans-serif;padding:2rem">` +
            `No se puede conectar con Proxmox <b>${node.name}</b> ` +
            `(${node.host}:${node.port || 8006}). ` +
            `Verifica que el nodo esté encendido y accesible desde el servidor del panel.</p>`
          );
        }
      },
    },
    // Recorta el prefijo del path antes de reenviar al nodo
    pathRewrite: { [`^/proxmox/${node.name}`]: '' },
  });

  return { mountPath, proxy };
}

/**
 * Registra los proxies de la UI de Proxmox para cada nodo.
 * Devuelve los pares {mountPath, proxy} para el manejo de WebSocket en server.js.
 * IMPORTANTE: llamar ANTES de authMiddleware — el iframe no puede enviar el JWT.
 * Proxmox tiene su propio sistema de autenticación (PVEAuthCookie).
 */
export function registerProxmoxUiProxies(app) {
  const entries = [];
  for (const node of config.nodes) {
    if (node.type === 'hyperv') continue; // Hyper-V usa agente REST, no UI de Proxmox
    const { mountPath, proxy } = createNodeProxy(node);
    app.use(mountPath, proxy);
    entries.push({ mountPath, proxy });
    console.log(`[proxmox-ui] ${mountPath} → https://${node.host}:${node.port || 8006}`);
  }
  return entries;
}
