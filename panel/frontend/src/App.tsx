import { useState, useEffect } from 'react';
import { getToken, getRole, api } from './api/client';
import Landing from './components/Landing';
import Login from './components/Login';
import DashboardLayout, { type Page } from './components/DashboardLayout';
import ResourceMonitor from './components/ResourceMonitor';
import VpsList from './components/VpsList';
import ProvisioningForm from './components/ProvisioningForm';
import CredentialManager from './components/CredentialManager';
import HistoryLog from './components/HistoryLog';
import ProxmoxConsole from './components/ProxmoxConsole';
import Services from './components/Services';
import PortalLayout from './components/portal/PortalLayout';
import MisProyectos from './components/portal/MisProyectos';
import NuevoProyecto from './components/portal/NuevoProyecto';
import PagoPlanes from './components/portal/PagoPlanes';
import MiServidor from './components/portal/MiServidor';
import AdminTools from './components/AdminTools';
import ClientManagement from './components/ClientManagement';
import AdminPayments from './components/AdminPayments';
import ServerManager from './components/ServerManager';

type PortalPage = 'proyectos' | 'nuevo' | 'servidor';

interface ClientInfo { name?: string; approved: boolean; plan?: string | null }

function AdminPanel() {
  const [page, setPage] = useState<Page>('dashboard');
  return (
    <DashboardLayout page={page} onNavigate={setPage}>
      {page === 'dashboard' && (
        <div className="space-y-4">
          <ResourceMonitor />
          <VpsList />
        </div>
      )}
      {page === 'provision' && <ProvisioningForm />}
      {page === 'herramientas' && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-100">Herramientas de sistema</h2>
          <p className="text-sm text-slate-500 mb-4">Monitor de deploys, diagnóstico de tiempos y herramientas de recuperación.</p>
          <AdminTools />
        </div>
      )}
      {page === 'clientes' && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-100">Gestión de clientes</h2>
          <p className="text-sm text-slate-500 mb-4">Aprobar cuentas nuevas, asignar planes y cuotas, generar invitaciones.</p>
          <ClientManagement />
        </div>
      )}
      {page === 'pagos' && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-100">Gestión de pagos</h2>
          <p className="text-sm text-slate-500 mb-4">Órdenes de pago, confirmación manual y estadísticas de cobro.</p>
          <AdminPayments />
        </div>
      )}
      {page === 'servidor' && <ServerManager />}
      {page === 'services' && <Services />}
      {page === 'credentials' && <CredentialManager />}
      {page === 'history' && <HistoryLog />}
      {page === 'console' && <ProxmoxConsole />}
    </DashboardLayout>
  );
}

interface ProyectoResumen { id: string; nombre: string; url?: string; estado: string }

function ClientPortal() {
  const [page, setPage] = useState<PortalPage>('proyectos');
  const [clientInfo, setClientInfo] = useState<ClientInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeProject, setActiveProject] = useState<ProyectoResumen | null>(null);

  useEffect(() => {
    api<ClientInfo>('/portal/me')
      .then(setClientInfo)
      .catch(() => setClientInfo({ approved: false }))
      .finally(() => setLoading(false));
  }, []);

  // Cuando el cliente va a "Mi servidor", cargar el proyecto activo más reciente
  useEffect(() => {
    if (page !== 'servidor' || activeProject) return;
    api<ProyectoResumen[]>('/portal/projects')
      .then((ps) => {
        const activo = ps.find((p) => p.estado === 'activo') ?? ps[0] ?? null;
        setActiveProject(activo);
      })
      .catch(() => {});
  }, [page, activeProject]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        Cargando...
      </div>
    );
  }

  if (!clientInfo?.approved) {
    return (
      <PortalLayout page={page} onNavigate={setPage} userName={clientInfo?.name}>
        <PagoPlanes onAprobado={() => setClientInfo((prev) => prev ? { ...prev, approved: true } : { approved: true })} />
      </PortalLayout>
    );
  }

  return (
    <PortalLayout page={page} onNavigate={setPage} userName={clientInfo?.name}>
      {page === 'proyectos' && (
        <MisProyectos
          onNuevo={() => setPage('nuevo')}
          onGestionarServidor={(p) => { setActiveProject(p); setPage('servidor'); }}
        />
      )}
      {page === 'nuevo' && <NuevoProyecto onCreado={() => setPage('proyectos')} onCancelar={() => setPage('proyectos')} />}
      {page === 'servidor' && (
        activeProject
          ? <MiServidor proyectoId={activeProject.id} url={activeProject.url} />
          : (
            <div className="py-8 text-center text-slate-500 text-sm space-y-2">
              <p>Aún no tienes proyectos activos.</p>
              <button onClick={() => setPage('nuevo')} className="text-indigo-400 hover:underline text-sm">Crear tu primer proyecto →</button>
            </div>
          )
      )}
    </PortalLayout>
  );
}

export default function App() {
  const [authed, setAuthed] = useState(() => !!getToken());
  const [role, setRole] = useState<'admin' | 'client' | null>(() => authed ? getRole() : null);
  const [showLogin, setShowLogin] = useState(false);

  function handleLogin() {
    setRole(getRole());
    setAuthed(true);
    setShowLogin(false);
  }

  if (!authed) {
    if (showLogin) return <Login onLogin={handleLogin} onBack={() => setShowLogin(false)} />;
    return <Landing onLogin={() => setShowLogin(true)} />;
  }
  if (role === 'client') return <ClientPortal />;
  return <AdminPanel />;
}
