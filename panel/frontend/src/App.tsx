import { useState } from 'react';
import { getToken, getRole } from './api/client';
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

type PortalPage = 'proyectos' | 'nuevo';

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
      {page === 'services' && <Services />}
      {page === 'credentials' && <CredentialManager />}
      {page === 'history' && <HistoryLog />}
      {page === 'console' && <ProxmoxConsole />}
    </DashboardLayout>
  );
}

function ClientPortal() {
  const [page, setPage] = useState<PortalPage>('proyectos');
  return (
    <PortalLayout page={page} onNavigate={setPage}>
      {page === 'proyectos' && <MisProyectos onNuevo={() => setPage('nuevo')} />}
      {page === 'nuevo' && <NuevoProyecto onCreado={() => setPage('proyectos')} onCancelar={() => setPage('proyectos')} />}
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
