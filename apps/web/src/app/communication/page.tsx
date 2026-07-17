import { ClientCommunicationWorkspace } from '../../components/client-communication-workspace';
import { DashboardShell } from '../../components/dashboard-shell';
export default function ClientCommunicationPage() { return <DashboardShell workspace activeHref="/communication" eyebrow="Client engagement" title="Client Communication" subtitle="Manage SMS conversations with pet owners in one focused inbox."><ClientCommunicationWorkspace /></DashboardShell>; }
