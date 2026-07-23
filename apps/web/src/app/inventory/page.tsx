import { DashboardShell } from '../../components/dashboard-shell';
import { InventoryWorkspace } from '../../components/inventory/inventory-workspace';
export default function InventoryPage() { return <DashboardShell activeHref="/inventory" eyebrow="Operations" title="Inventory" subtitle="Items, stock, lots, and adjustments"><InventoryWorkspace /></DashboardShell>; }
