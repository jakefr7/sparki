import { Suspense } from 'react';
import { ClientCommunicationWorkspace } from '../../components/client-communication-workspace';
import { DashboardShell } from '../../components/dashboard-shell';
export default function ClientCommunicationPage() {
  return (
    <DashboardShell
      workspace
      activeHref="/communication"
      eyebrow="Client engagement"
      title="Client Communication"
    >
      <Suspense fallback={<p>Loading client conversations…</p>}>
        <ClientCommunicationWorkspace />
      </Suspense>
    </DashboardShell>
  );
}
