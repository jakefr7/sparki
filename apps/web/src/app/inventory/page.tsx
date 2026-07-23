import { DashboardShell } from '../../components/dashboard-shell';
import { InventoryWorkspace } from '../../components/inventory/inventory-workspace';

export default function InventoryPage() {
  return (
    <DashboardShell
      activeHref="/inventory"
      eyebrow="Operations"
      title="Inventory"
      subtitle="Stock, purchasing, usage, counts, and compliance records"
    >
      <InventoryWorkspace />
    </DashboardShell>
  );
}
