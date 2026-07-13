import { useState } from 'react';
import { getToken } from './api/client';
import Login from './components/Login';
import DashboardLayout, { type Page } from './components/DashboardLayout';
import ResourceMonitor from './components/ResourceMonitor';
import VpsList from './components/VpsList';
import ProvisioningForm from './components/ProvisioningForm';
import CredentialManager from './components/CredentialManager';
import HistoryLog from './components/HistoryLog';
import ProxmoxConsole from './components/ProxmoxConsole';
import Services from './components/Services';

export default function App() {
  const [authed, setAuthed] = useState(() => !!getToken());
  const [page, setPage] = useState<Page>('dashboard');

  if (!authed) return <Login onLogin={() => setAuthed(true)} />;

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
