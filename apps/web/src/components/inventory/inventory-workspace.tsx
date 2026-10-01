'use client';
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type Item = {
  id: string;
  name: string;
  primaryType: string;
  sku: string | null;
  status: string;
  available: string;
  onHand: string;
  quarantined: string;
  expired: string;
  retailPrice: string | null;
  nextExpiration: string | null;
  primaryLocation: string | null;
  attention: string[];
  description: string | null;
  route: string | null;
  therapeuticClass: string | null;
  species: string[];
  tags: string[];
  brand: string | null;
  manufacturer: string | null;
  strength: string | null;
  form: string | null;
  defaultFrequency: string | null;
  markupPercent: string | null;
  internalNotes: string | null;
  billable: boolean;
  taxable: boolean;
  inventoryTracked: boolean;
  lotTracking: boolean;
  expirationTracking: boolean;
  controlledSubstance: boolean;
  deaSchedule: string | null;
  minimumStock: string | null;
  maximumStock: string | null;
  reorderPoint: string | null;
  reorderQuantity: string | null;
  barcodes: Array<{ value: string; barcodeType: string; unit: string | null }>;
  conversions: Array<{
    purchaseUnit: string;
    stockUnit: string;
    dispenseUnit: string | null;
    billingUnit: string | null;
    purchaseToStock: string;
    stockToDispense: string | null;
    stockToBilling: string | null;
    isActive: boolean;
  }>;
  permissions: { canEdit: boolean; canArchive: boolean; canDelete: boolean };
  lots: Array<{
    id: string;
    lotNumber: string | null;
    expirationDate: string | null;
    status: string;
    quantity: string;
    stockLocation: { id: string; name: string };
  }>;
  balances: Array<{
    id: string;
    lotId: string | null;
    onHand: string;
    quarantined: string;
    expired: string;
    reserved: string;
    stockLocation: { id: string; name: string };
  }>;
  documents: Array<{ id: string; name: string; type: string; url: string }>;
  countHistory?: Array<{
    id: string;
    finalCountedQuantity: string | null;
    expectedQuantitySnapshot: string;
    varianceQuantity: string | null;
    session: { id: string; number: string; postedAt: string | null };
  }>;
};
type Location = { id: string; name: string; parentId: string | null };
type Activity = {
  id: string;
  createdAt: string;
  transactionType: string;
  previousBalance: string;
  quantityDelta: string;
  resultingBalance: string;
  reason: string;
  item: { name: string };
  stockLocation: { name: string };
  lot: { lotNumber: string | null } | null;
  user: { firstName: string; lastName: string };
};
type Vendor = {
  id: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  archivedAt: string | null;
  items: Array<{
    id: string;
    purchaseUnit: string;
    packageCost?: string | null;
    item: { name: string };
  }>;
};
type Order = {
  id: string;
  number: string;
  status: string;
  expectedDate: string | null;
  vendor: { name: string };
  lines: Array<{
    id: string;
    itemId: string;
    itemNameSnapshot: string;
    orderedQuantity: string;
    receivedQuantity: string;
    outstandingQuantity: string;
    purchaseUnitSnapshot: string;
    stockUnitSnapshot: string;
    conversionSnapshot: string;
  }>;
};
type CountSummary = {
  id: string;
  number: string;
  countType: string;
  status: string;
  blindCount: boolean;
  startedAt: string | null;
  progress: { total: number; counted: number; recounts: number };
  permissions: { canStart: boolean; canApprove: boolean; canPost: boolean };
};
type CountLine = {
  id: string;
  itemNameSnapshot: string;
  skuSnapshot: string | null;
  baseUnitSnapshot: string;
  lotNumberSnapshot: string | null;
  expectedQuantitySnapshot?: string;
  finalCountedQuantity: string | null;
  varianceQuantity?: string;
  status: string;
  recountRequired: boolean;
  item: { barcodes: Array<{ value: string }> };
};
type CountDetail = CountSummary & {
  requireAllLines: boolean;
  lines: CountLine[];
  assignments: unknown[];
};
type ControlledProfile = {
  id: string;
  registrationId: string;
  baseUnit: string;
  federalSchedule: string;
  strength: string;
  dosageForm: string;
  secureStockLocationIds: string[];
  item: { id: string; name: string; sku: string | null };
  containers: Array<{
    id: string;
    containerNumber: string;
    stockLocationId: string;
    currentQuantity: string;
    status: string;
  }>;
};
type ControlledLedger = {
  id: string;
  entryNumber: string;
  eventAt: string;
  eventType: string;
  quantityChanged: string;
  quantityAfter: string;
  performedById: string;
  witnessId: string | null;
  patientId: string | null;
  profile: { item: { name: string }; federalSchedule: string };
  container: { containerNumber: string } | null;
};
type ControlledOverview = { metrics: Record<string, number>; notice: string };
type ControlledDiscrepancy = {
  id: string;
  caseNumber: string;
  severity: string;
  classification: string;
  status: string;
};
type ControlledReport = {
  id: string;
  type: string;
  status: string;
  jurisdiction: string;
  authority: string;
  externalConfirmationNumber: string | null;
};
type ControlledCount = {
  id: string;
  number: string;
  registrationId: string;
  type: string;
  timing: string;
  status: string;
  blindCount: boolean;
  lines: Array<{
    id: string;
    finalQuantity?: string | null;
    variance?: string | null;
    containerSnapshot?: { containerNumber?: string };
    profileSnapshot?: { baseUnit?: string; federalSchedule?: string };
  }>;
};
type ControlledCorrection = {
  id: string;
  number: string;
  status: string;
  reason: string;
  explanation: string;
  originalEntryId: string;
};
type ControlledDisposal = {
  id: string;
  number: string;
  status: string;
  reason: string;
  proposedMethod: string;
  lines: Array<{ id: string; quantity: string; unitSnapshot: string }>;
};
type ControlledAuthorization = {
  id: string;
  registrationId: string;
  userId: string;
  authorizationType: string;
  status: string;
};
type UsageMapping = {
  id: string;
  sourceType: string;
  sourceReference: string;
  version: number;
  isActive: boolean;
  deductionEvent: string;
  reservationBehavior: string;
  lotSelectionPolicy: string;
  components: Array<{
    id: string;
    itemId: string;
    quantityRule: string;
    fixedQuantity: string | null;
    quantityUnit: string;
  }>;
};
type UsageEvent = {
  id: string;
  eventType: string;
  sourceRecordType: string;
  sourceRecordId: string;
  status: string;
  failureCode: string | null;
  failureMessage: string | null;
  occurredAt: string;
  patientId: string | null;
  mappingSnapshot: {
    components?: Array<{ itemId: string }>;
  } | null;
  lines: Array<{ id: string; itemId: string; confirmedQuantity: string; unitSnapshot: string }>;
};
type UsageReservation = {
  id: string;
  itemId: string;
  quantity: string;
  consumedQuantity: string;
  baseUnitSnapshot: string;
  status: string;
  sourceEventType: string;
  expiresAt: string | null;
};
type UsageMetrics = Record<string, number>;
const tabs = [
  'Overview',
  'Items',
  'Usage',
  'Purchasing',
  'Counts',
  'Controlled',
  'Activity',
] as const;
const later = new Set<string>();
const fmt = (n: string | null) =>
  n == null ? '—' : Number(n).toLocaleString(undefined, { maximumFractionDigits: 4 });
const humanize = (value: string) => {
  const labels: Record<string, string> = {
    SUPPLY: 'Medical supply',
    FULL: 'Full inventory',
    LOCATION: 'Location count',
    CATEGORY: 'Category count',
    CYCLE: 'Cycle count',
    LOT: 'Lot count',
    FEFO: 'First expiring, first out',
    FIFO: 'First received, first out',
  };
  return (
    labels[value] ??
    value
      .toLowerCase()
      .replaceAll('_', ' ')
      .replace(/^\w/, (letter) => letter.toUpperCase())
  );
};
function InventoryStatus({ value }: { value: string }) {
  const state = /failed|rejected|out_of_stock|cancelled/i.test(value)
    ? 'critical'
    : /pending|review|partial|recount|expir/i.test(value)
      ? 'warning'
      : /active|approved|posted|complete|ordered/i.test(value)
        ? 'positive'
        : 'neutral';
  return (
    <span className="inventory-status" data-state={state}>
      {humanize(value)}
    </span>
  );
}
function EmptyState({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <div className="inventory-empty">
      <strong>{title}</strong>
      <span>{detail}</span>
      {action}
    </div>
  );
}

export function InventoryWorkspace() {
  const [tab, setTab] = useState<(typeof tabs)[number]>('Overview');
  const [items, setItems] = useState<Item[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [counts, setCounts] = useState<CountSummary[]>([]);
  const [activeCount, setActiveCount] = useState<CountDetail | null>(null);
  const [controlledOverview, setControlledOverview] = useState<ControlledOverview | null>(null);
  const [controlledProfiles, setControlledProfiles] = useState<ControlledProfile[]>([]);
  const [controlledLedger, setControlledLedger] = useState<ControlledLedger[]>([]);
  const [controlledDiscrepancies, setControlledDiscrepancies] = useState<ControlledDiscrepancy[]>(
    [],
  );
  const [controlledReports, setControlledReports] = useState<ControlledReport[]>([]);
  const [controlledCounts, setControlledCounts] = useState<ControlledCount[]>([]);
  const [controlledCorrections, setControlledCorrections] = useState<ControlledCorrection[]>([]);
  const [controlledDisposals, setControlledDisposals] = useState<ControlledDisposal[]>([]);
  const [controlledAuthorizations, setControlledAuthorizations] = useState<
    ControlledAuthorization[]
  >([]);
  const [usageMappings, setUsageMappings] = useState<UsageMapping[]>([]);
  const [usageEvents, setUsageEvents] = useState<UsageEvent[]>([]);
  const [usageReservations, setUsageReservations] = useState<UsageReservation[]>([]);
  const [usageMetrics, setUsageMetrics] = useState<UsageMetrics>({});
  const [overview, setOverview] = useState<{
    metrics: Record<string, number>;
    attention: Array<{ itemId: string; itemName: string; message: string }>;
  } | null>(null);
  const [search, setSearch] = useState('');
  const [itemView, setItemView] = useState('All Items');
  const [sectionSearch, setSectionSearch] = useState('');
  const [itemReviewNotice, setItemReviewNotice] = useState('');
  const [purchasingView, setPurchasingView] = useState<'Orders' | 'Vendors'>('Orders');
  const [selected, setSelected] = useState<Item | null>(null);
  const [adjustItemId, setAdjustItemId] = useState<string | undefined>();
  const [modal, setModal] = useState<
    | 'add'
    | 'edit'
    | 'duplicate'
    | 'adjust'
    | 'scan'
    | 'vendor'
    | 'order'
    | 'receive'
    | 'transfer'
    | 'count'
    | null
  >(null);
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    const [i, o, l, a, v, p, c, co, cp, cl, cd, cr, cc, cx, cw, ca, um, ue, ur, ux] =
      await Promise.all([
        fetch('/api/inventory/items'),
        fetch('/api/inventory/overview'),
        fetch('/api/inventory/locations'),
        fetch('/api/inventory/activity'),
        fetch('/api/inventory/vendors'),
        fetch('/api/inventory/orders'),
        fetch('/api/inventory/counts'),
        fetch('/api/inventory/controlled/overview'),
        fetch('/api/inventory/controlled/profiles'),
        fetch('/api/inventory/controlled/ledger'),
        fetch('/api/inventory/controlled/discrepancies'),
        fetch('/api/inventory/controlled/reports'),
        fetch('/api/inventory/controlled/counts'),
        fetch('/api/inventory/controlled/corrections'),
        fetch('/api/inventory/controlled/disposals'),
        fetch('/api/inventory/controlled/authorizations'),
        fetch('/api/inventory/usage/mappings'),
        fetch('/api/inventory/usage/events'),
        fetch('/api/inventory/usage/reservations'),
        fetch('/api/inventory/usage/metrics'),
      ]);
    if (i.ok) {
      const next: Item[] = await i.json();
      setItems(next);
      setSelected((current) =>
        current ? (next.find((item) => item.id === current.id) ?? current) : null,
      );
    }
    if (o.ok) setOverview(await o.json());
    if (l.ok) setLocations(await l.json());
    if (a.ok) setActivity(await a.json());
    if (v.ok) setVendors(await v.json());
    if (p.ok) setOrders(await p.json());
    if (c.ok) setCounts(await c.json());
    if (co.ok) setControlledOverview(await co.json());
    if (cp.ok) setControlledProfiles(await cp.json());
    if (cl.ok) setControlledLedger(await cl.json());
    if (cd.ok) setControlledDiscrepancies(await cd.json());
    if (cr.ok) setControlledReports(await cr.json());
    if (cc.ok) setControlledCounts(await cc.json());
    if (cx.ok) setControlledCorrections(await cx.json());
    if (cw.ok) setControlledDisposals(await cw.json());
    if (ca.ok) setControlledAuthorizations(await ca.json());
    if (um.ok) setUsageMappings(await um.json());
    if (ue.ok) setUsageEvents(await ue.json());
    if (ur.ok) setUsageReservations(await ur.json());
    if (ux.ok) setUsageMetrics(await ux.json());
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void load().catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Inventory could not be loaded.')), 180);
    return () => clearTimeout(timer);
  }, [load]);
  const metrics = overview?.metrics;
  return (
    <div className="inventory">
      <nav className="inventory__tabs" aria-label="Inventory sections">
        {tabs
          .filter((name) => name !== 'Controlled' || controlledOverview)
          .map((name) => (
            <button
              key={name}
              className={tab === name ? 'is-active' : ''}
              onClick={() => setTab(name)}
            >
              {name}
            </button>
          ))}
      </nav>
      {tab === 'Purchasing' && (
        <nav className="inventory__subnav" aria-label="Purchasing sections">
          {(['Orders', 'Vendors'] as const).map((name) => (
            <button
              key={name}
              className={purchasingView === name ? 'is-active' : ''}
              onClick={() => setPurchasingView(name)}
            >
              {name}
            </button>
          ))}
        </nav>
      )}
      <div className="inventory-command" aria-label={`${tab} commands`}>
        {tab === 'Items' && (
          <label className="inventory__search">
            <span className="sr-only">Search items</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, SKU, or barcode"
            />
          </label>
        )}
        {['Purchasing', 'Activity'].includes(tab) && (
          <label className="inventory__search">
            <span className="sr-only">Search {tab.toLowerCase()}</span>
            <input
              value={sectionSearch}
              onChange={(e) => setSectionSearch(e.target.value)}
              placeholder={tab === 'Purchasing' ? 'Search orders or vendors' : 'Search activity'}
            />
          </label>
        )}
        <div className="inventory-command__actions">
          {tab === 'Overview' && (
            <button
              className="button-primary"
              onClick={() => document.querySelector('#inventory-attention')?.scrollIntoView()}
            >
              View attention
            </button>
          )}
          {tab === 'Items' && (
            <button className="button-primary" onClick={() => setModal('add')}>
              Add item
            </button>
          )}
          {tab === 'Purchasing' && purchasingView === 'Orders' && (
            <button className="button-primary" onClick={() => setModal('order')}>
              New purchase order
            </button>
          )}
          {tab === 'Purchasing' && purchasingView === 'Vendors' && (
            <button className="button-primary" onClick={() => setModal('vendor')}>
              Add vendor
            </button>
          )}
          {tab === 'Counts' && !activeCount && (
            <button className="button-primary" onClick={() => setModal('count')}>
              Start count
            </button>
          )}
          {tab === 'Activity' && (
            <button
              className="button-primary"
              onClick={() => exportActivity(activity, sectionSearch)}
            >
              Export activity
            </button>
          )}
          {['Overview', 'Items', 'Counts'].includes(tab) && (
            <button
              onClick={() =>
                activeCount
                  ? document.querySelector<HTMLInputElement>('[data-count-scan]')?.focus()
                  : setModal('scan')
              }
            >
              Scan item
            </button>
          )}
          {tab === 'Purchasing' && purchasingView === 'Orders' && (
            <button onClick={() => setModal('receive')}>Receive inventory</button>
          )}
          <details className="inventory-command__menu">
            <summary role="button">Actions</summary>
            <div>
              <button onClick={() => { setAdjustItemId(undefined); setModal('adjust'); }}>Adjust stock</button>
              <button onClick={() => setModal('transfer')}>Transfer stock</button>
              {tab !== 'Items' && <button onClick={() => setModal('add')}>Add item</button>}
              {tab !== 'Purchasing' && (
                <button
                  onClick={() => {
                    setTab('Purchasing');
                    setPurchasingView('Orders');
                  }}
                >
                  View purchasing
                </button>
              )}
            </div>
          </details>
        </div>
      </div>
      {error && <div className="inventory__error">{error}</div>}
      {later.has(tab) && (
        <section className="inventory__planned">
          <h2>{tab}</h2>
          <p>Planned for a later inventory pass. No operational data is shown yet.</p>
        </section>
      )}
      {tab === 'Overview' && (
        <>
          <div className="inventory__metrics inventory__metrics--primary">
            <Metric label="Needs Attention" value={metrics?.needsAttention} />
            <Metric label="Low or Out of Stock" value={metrics?.lowOrOut} />
            <Metric label="Expiring Soon" value={metrics?.expiringSoon} />
            <Metric label="Total Active Items" value={metrics?.totalActiveItems} />
          </div>
          <div className="inventory__operational">
            <section>
              <h3>Purchasing</h3>
              <Metric label="Open orders" value={metrics?.openOrders} />
              <Metric label="Overdue deliveries" value={metrics?.overdueDeliveries} />
            </section>
            <section>
              <h3>Counts</h3>
              <Metric label="Active counts" value={metrics?.activeCounts} />
              <Metric label="Awaiting review" value={metrics?.countsAwaitingReview} />
            </section>
            <section>
              <h3>Recent operations</h3>
              <Metric label="Recent Adjustments" value={metrics?.recentAdjustments} />
              <Metric label="Receipt Issues" value={metrics?.receiptIssues} />
            </section>
          </div>
          <section className="inventory__panel" id="inventory-attention">
            <h2>Needs Attention</h2>
            {overview?.attention.length ? (
              <div className="attention-list">
                {overview.attention.map((row, index) => (
                  <button
                    key={`${row.itemId}-${index}`}
                    onClick={() => {
                      const item = items.find((i) => i.id === row.itemId);
                      if (item) setSelected(item);
                    }}
                  >
                    <span>
                      <strong>{row.itemName}</strong>
                      <small>{row.message}</small>
                    </span>
                    <span>Review →</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="inventory__empty">Nothing needs attention at this location.</p>
            )}
          </section>
        </>
      )}
      {tab === 'Items' && (
        <>
          {itemReviewNotice && (
            <div className="inventory-context">
              <span>{itemReviewNotice}</span>
              <button
                onClick={() => {
                  setItemReviewNotice('');
                  setSearch('');
                }}
              >
                Show all items
              </button>
            </div>
          )}
          <ItemsTable
            items={items}
            search={search}
            view={itemView}
            onViewChange={setItemView}
            onClear={() => {
              setSearch('');
              setItemView('All Items');
              setItemReviewNotice('');
            }}
            onSelect={setSelected}
          />
        </>
      )}
      {tab === 'Usage' && (
        <UsagePanel
          mappings={usageMappings}
          events={usageEvents}
          reservations={usageReservations}
          metrics={usageMetrics}
          items={items}
          onSaved={load}
          onReviewInventory={(itemId) => {
            const item = items.find((candidate) => candidate.id === itemId);
            setItemView('All Items');
            setSearch(item?.name ?? '');
            setItemReviewNotice(
              item
                ? `Reviewing stock for ${item.name} because a clinical deduction could not post.`
                : 'Reviewing items that may need stock before the clinical deduction can post.',
            );
            setTab('Items');
          }}
        />
      )}
      {tab === 'Purchasing' && (
        <>
          {purchasingView === 'Vendors' ? (
            <VendorsPanel
              vendors={vendors.filter((vendor) =>
                `${vendor.name} ${vendor.contactName ?? ''} ${vendor.email ?? ''}`
                  .toLowerCase()
                  .includes(sectionSearch.toLowerCase()),
              )}
            />
          ) : (
            <OrdersPanel
              orders={orders.filter((order) =>
                `${order.number} ${order.vendor.name} ${order.status}`
                  .toLowerCase()
                  .includes(sectionSearch.toLowerCase()),
              )}
              onReceive={(order) => {
                setActiveOrder(order);
                setModal('receive');
              }}
              onChanged={load}
            />
          )}
        </>
      )}
      {tab === 'Counts' &&
        (activeCount ? (
          <CountWorkspace
            count={activeCount}
            onRefresh={async () => {
              const r = await fetch(`/api/inventory/counts/${activeCount.id}`);
              if (r.ok) setActiveCount(await r.json());
              await load();
            }}
            onExit={() => setActiveCount(null)}
          />
        ) : (
          <CountsPanel
            counts={counts}
            onOpen={async (c) => {
              const r = await fetch(`/api/inventory/counts/${c.id}`);
              if (r.ok) setActiveCount(await r.json());
            }}
          />
        ))}
      {tab === 'Controlled' && (
        <ControlledPanel
          overview={controlledOverview}
          profiles={controlledProfiles}
          ledger={controlledLedger}
          discrepancies={controlledDiscrepancies}
          reports={controlledReports}
          counts={controlledCounts}
          corrections={controlledCorrections}
          disposals={controlledDisposals}
          authorizations={controlledAuthorizations}
          locations={locations}
          onSaved={load}
        />
      )}
      {tab === 'Activity' && <ActivityTable rows={activity} search={sectionSearch} />}
      {selected && (
        <ItemDrawer
          item={selected}
          activity={activity.filter((a) => a.item.name === selected.name)}
          onClose={() => setSelected(null)}
          onEdit={() => setModal('edit')}
          onAdjust={() => { setAdjustItemId(selected.id); setModal('adjust'); }}
          onDuplicate={() => setModal('duplicate')}
          onDelete={async () => {
            if (!window.confirm(`Permanently delete unused item ${selected.name}?`)) return;
            const response = await fetch(`/api/inventory/items/${selected.id}`, {
              method: 'DELETE',
            });
            if (!response.ok) setError((await response.json()).message ?? 'Unable to delete item');
            else {
              setSelected(null);
              await load();
            }
          }}
          onArchive={async () => {
            if (
              Number(selected.available) > 0 &&
              !window.confirm(
                `${selected.name} still has ${fmt(selected.available)} available. Archive it anyway?`,
              )
            )
              return;
            const r = await fetch(`/api/inventory/items/${selected.id}/archive`, {
              method: 'POST',
            });
            if (!r.ok) setError((await r.json()).message ?? 'Unable to archive item');
            else await load();
          }}
        />
      )}
      {modal === 'scan' && (
        <Modal title="Scan item" onClose={() => setModal(null)}>
          <p>
            USB and Bluetooth scanners that send keyboard input are supported inside an active
            count. Camera scanning is not implemented.
          </p>
        </Modal>
      )}
      {modal === 'add' && <ItemEditor mode="add" onClose={() => setModal(null)} onSaved={load} />}
      {modal === 'edit' && selected && (
        <ItemEditor
          mode="edit"
          item={selected}
          onClose={() => setModal(null)}
          onSaved={async (savedId) => {
            await load();
            const response = await fetch(`/api/inventory/items/${savedId}`);
            if (response.ok) setSelected(await response.json());
          }}
        />
      )}
      {modal === 'duplicate' && selected && (
        <ItemEditor
          mode="duplicate"
          item={selected}
          onClose={() => setModal(null)}
          onSaved={load}
        />
      )}
      {modal === 'adjust' && (
        <AdjustStock
          initialItemId={adjustItemId}
          items={items}
          locations={locations}
          onClose={() => setModal(null)}
          onSaved={load}
          onError={setError}
        />
      )}
      {modal === 'vendor' && (
        <VendorEditor items={items} onClose={() => setModal(null)} onSaved={load} />
      )}
      {modal === 'order' && (
        <OrderEditor
          vendors={vendors}
          items={items}
          onClose={() => setModal(null)}
          onSaved={load}
        />
      )}
      {modal === 'receive' && (
        <ReceiveEditor
          order={activeOrder}
          vendors={vendors}
          items={items}
          locations={locations}
          onClose={() => {
            setModal(null);
            setActiveOrder(null);
          }}
          onSaved={load}
        />
      )}
      {modal === 'transfer' && (
        <TransferEditor
          items={items}
          locations={locations}
          onClose={() => setModal(null)}
          onSaved={load}
        />
      )}
      {modal === 'count' && (
        <StartCount
          locations={locations}
          onClose={() => setModal(null)}
          onStarted={async (id) => {
            await load();
            const r = await fetch(`/api/inventory/counts/${id}`);
            if (r.ok) setActiveCount(await r.json());
          }}
        />
      )}
    </div>
  );
}
function Metric({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="inventory__metric">
      <span>{label}</span>
      <strong>{value ?? '—'}</strong>
    </div>
  );
}
function ItemsTable({ items, search, view, onViewChange, onClear, onSelect }: {
  items: Item[];
  search: string;
  view: string;
  onViewChange: (view: string) => void;
  onClear: () => void;
  onSelect: (item: Item) => void;
}) {
  const views = [
    'All Items',
    'Low Stock',
    'Out of Stock',
    'Expiring',
    'Medications',
    'Vaccines',
    'Retail',
    'Supplies',
    'Inactive',
    'Needs Setup',
  ];
  const shown = useMemo(
    () =>
      items.filter(
        (i) =>
          [i.name, i.sku, ...i.barcodes.map((barcode) => barcode.value)].some((value) =>
            value?.toLowerCase().includes(search.trim().toLowerCase()),
          ) && (view === 'All Items' ||
          (view === 'Low Stock' && i.attention.some((a) => a.includes('reorder'))) ||
          (view === 'Out of Stock' && i.attention.includes('Out of stock')) ||
          (view === 'Expiring' && i.attention.some((a) => /Expire/i.test(a))) ||
          (view === 'Medications' && i.primaryType === 'MEDICATION') ||
          (view === 'Vaccines' && i.primaryType === 'VACCINE') ||
          (view === 'Retail' && i.primaryType === 'RETAIL') ||
          (view === 'Supplies' && i.primaryType === 'SUPPLY') ||
          (view === 'Inactive' && i.status !== 'ACTIVE') ||
          (view === 'Needs Setup' && i.attention.some((a) => a.includes('setup')))),
      ),
    [items, view, search],
  );
  return (
    <section className="inventory__panel">
      <div className="inventory__views">
        {views.map((v) => (
          <button className={v === view ? 'is-active' : ''} key={v} aria-pressed={v === view} onClick={() => onViewChange(v)}>
            {v}
          </button>
        ))}
      </div>
      <div className="inventory-context" role="status">
        <span>{shown.length} of {items.length} items{view !== 'All Items' ? ` · ${view}` : ''}{search.trim() ? ` · “${search.trim()}”` : ''}</span>
        {search || view !== 'All Items' ? <button type="button" onClick={onClear}>Clear filters</button> : null}
      </div>
      <div className="inventory__table-wrap">
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Type</th>
              <th title="On hand minus reserved, quarantined, and expired stock">Available</th>
              <th>On Hand</th>
              <th>Status</th>
              <th>Next Expiration</th>
              <th>Primary Location</th>
              <th>Retail Price</th>
              <th>Attention</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((i) => (
              <tr
                key={i.id}
                tabIndex={0}
                onClick={() => onSelect(i)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelect(i);
                  }
                }}
              >
                <td>
                  <strong>{i.name}</strong>
                  <small>{[i.sku || 'No SKU', i.strength, i.form].filter(Boolean).join(' · ')}</small>
                </td>
                <td>{humanize(i.primaryType)}</td>
                <td className="inventory-number">{fmt(i.available)}</td>
                <td className="inventory-number">{fmt(i.onHand)}</td>
                <td>
                  <InventoryStatus value={i.status} />
                </td>
                <td>{i.nextExpiration ? new Date(i.nextExpiration).toLocaleDateString() : '—'}</td>
                <td>{i.primaryLocation || '—'}</td>
                <td>{i.retailPrice ? `$${Number(i.retailPrice).toFixed(2)}` : '—'}</td>
                <td>{i.attention[0] || '—'}</td>
              </tr>
            ))}
            {!shown.length && (
              <tr>
                <td colSpan={9}>
                  <EmptyState
                    title="No items in this view"
                    detail="Try another saved view or clear the item search."
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
function exportActivity(rows: Activity[], search: string) {
  const filtered = rows.filter((row) =>
    `${row.item.name} ${row.transactionType} ${row.reason} ${row.stockLocation.name}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const csv = [
    [
      'Timestamp',
      'Item',
      'Type',
      'Previous',
      'Change',
      'Result',
      'Location',
      'Lot',
      'User',
      'Reason',
    ],
    ...filtered.map((row) => [
      row.createdAt,
      row.item.name,
      humanize(row.transactionType),
      row.previousBalance,
      row.quantityDelta,
      row.resultingBalance,
      row.stockLocation.name,
      row.lot?.lotNumber ?? '',
      `${row.user.firstName} ${row.user.lastName}`,
      humanize(row.reason),
    ]),
  ]
    .map((line) => line.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(','))
    .join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `inventory-activity-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
function ActivityTable({ rows, search = '' }: { rows: Activity[]; search?: string }) {
  const shown = rows.filter((row) =>
    `${row.item.name} ${row.transactionType} ${row.reason} ${row.stockLocation.name}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <section className="inventory__panel">
      <h2>Inventory Activity</h2>
      <div className="inventory__table-wrap">
        <table>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Item</th>
              <th>Type</th>
              <th>Previous</th>
              <th>Change</th>
              <th>Result</th>
              <th>Location</th>
              <th>Lot</th>
              <th>User</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.createdAt).toLocaleString()}</td>
                <td>{r.item.name}</td>
                <td>{humanize(r.transactionType)}</td>
                <td className="inventory-number">{fmt(r.previousBalance)}</td>
                <td className="inventory-number">
                  {Number(r.quantityDelta) > 0 ? '+' : ''}
                  {fmt(r.quantityDelta)}
                </td>
                <td className="inventory-number">{fmt(r.resultingBalance)}</td>
                <td>{r.stockLocation.name}</td>
                <td>{r.lot?.lotNumber || '—'}</td>
                <td>
                  {r.user.firstName} {r.user.lastName}
                </td>
                <td>{humanize(r.reason)}</td>
              </tr>
            ))}
            {!shown.length && (
              <tr>
                <td colSpan={10}>
                  <EmptyState
                    title="No activity found"
                    detail="Clear the search or choose a broader activity filter."
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
function UsagePanel({
  mappings,
  events,
  reservations,
  metrics,
  items,
  onSaved,
  onReviewInventory,
}: {
  mappings: UsageMapping[];
  events: UsageEvent[];
  reservations: UsageReservation[];
  metrics: UsageMetrics;
  items: Item[];
  onSaved: () => Promise<void>;
  onReviewInventory: (itemId?: string) => void;
}) {
  const [view, setView] = useState<
    'Needs Review' | 'Mappings' | 'Reservations' | 'Usage History' | 'Lot Traceability'
  >(
    events.some((event) => ['NEEDS_REVIEW', 'FAILED', 'PENDING'].includes(event.status))
      ? 'Needs Review'
      : 'Mappings',
  );
  const [creating, setCreating] = useState(false);
  const [mappingSource, setMappingSource] = useState<UsageEvent | null>(null);
  const [error, setError] = useState('');
  return (
    <section className="inventory__panel">
      <div className="inventory__section-heading">
        <div>
          <h2>Clinical & Retail Usage</h2>
          <p>One source event, one deduction, with reservation and patient-lot traceability.</p>
        </div>
        <button className="button-primary" onClick={() => setCreating(true)}>
          Create Usage Mapping
        </button>
      </div>
      <div className="inventory__metrics">
        <Metric label="Usage Events Today" value={metrics.usageEventsToday} />
        <Metric label="Pending Usage Review" value={metrics.pendingUsageReview} />
        <Metric label="Failed Deductions" value={metrics.failedDeductions} />
        <Metric label="Active Reservations" value={metrics.activeReservations} />
        <Metric label="Reservations Expiring" value={metrics.reservationsExpiring} />
        <Metric label="Unmapped Clinical Items" value={metrics.unmappedClinicalItems} />
        <Metric label="Recent Reversals" value={metrics.recentReversals} />
      </div>
      <div className="inventory__views">
        {(
          ['Needs Review', 'Mappings', 'Reservations', 'Usage History', 'Lot Traceability'] as const
        ).map((name) => (
          <button
            key={name}
            className={view === name ? 'is-active' : ''}
            onClick={() => setView(name)}
          >
            {name}
          </button>
        ))}
      </div>
      {error && <div className="inventory__error">{error}</div>}
      {view === 'Needs Review' &&
        events
          .filter((event) => ['NEEDS_REVIEW', 'FAILED', 'PENDING'].includes(event.status))
          .map((event) => {
            const missingMapping = event.failureCode === 'NO_USAGE_MAPPING';
            const insufficientStock = event.failureCode === 'INSUFFICIENT_STOCK';
            const sourceType = event.sourceRecordType
              .replace(/^fixture/i, '')
              .replace(/record$/i, '');
            return (
              <article className="lot usage-review-card" key={event.id}>
                <div className="usage-review-card__heading">
                  <strong>{humanize(event.eventType)}</strong>
                  <InventoryStatus value={event.status} />
                </div>
                <span>
                  {humanize(sourceType || 'Clinical')} record
                  {!event.sourceRecordId.toLowerCase().startsWith('fixture-')
                    ? ` · ${event.sourceRecordId}`
                    : ''}
                </span>
                <small>
                  <strong>{humanize(event.failureCode ?? 'Pending')}</strong> —{' '}
                  {event.failureMessage ?? 'Awaiting posting'}
                </small>
                <div className="usage-review-card__actions">
                  {missingMapping && (
                    <button
                      className="button-primary"
                      onClick={() => {
                        setMappingSource(event);
                        setCreating(true);
                      }}
                    >
                      Create usage mapping
                    </button>
                  )}
                  {insufficientStock && (
                    <button
                      className="button-primary"
                      onClick={() =>
                        onReviewInventory(event.mappingSnapshot?.components?.[0]?.itemId)
                      }
                    >
                      Review inventory
                    </button>
                  )}
                  {!missingMapping && !insufficientStock && (
                    <button
                      className="button-secondary"
                      onClick={async () => {
                        const response = await fetch(
                          `/api/inventory/usage/events/${event.id}/retry`,
                          {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              idempotencyKey: crypto.randomUUID(),
                              lines: [],
                            }),
                          },
                        );
                        if (!response.ok)
                          setError((await response.json()).message ?? 'Unable to retry usage');
                        else await onSaved();
                      }}
                    >
                      Retry posting
                    </button>
                  )}
                </div>
              </article>
            );
          })}
      {view === 'Mappings' &&
        mappings.map((mapping) => (
          <article className="lot" key={mapping.id}>
            <strong>
              {mapping.sourceReference} · v{mapping.version}
            </strong>
            <span>
              {mapping.sourceType.replaceAll('_', ' ')} →{' '}
              {mapping.deductionEvent.replaceAll('_', ' ')}
            </span>
            <small>
              {mapping.components.length} component(s) · {mapping.lotSelectionPolicy} ·{' '}
              {mapping.reservationBehavior.replaceAll('_', ' ')} ·{' '}
              {mapping.isActive ? 'Active' : 'Archived'}
            </small>
            <div className="inventory__actions">
              <button
                onClick={async () => {
                  await fetch(`/api/inventory/usage/mappings/${mapping.id}/duplicate`, {
                    method: 'POST',
                  });
                  await onSaved();
                }}
              >
                Duplicate
              </button>
              {mapping.isActive && (
                <button
                  onClick={async () => {
                    await fetch(`/api/inventory/usage/mappings/${mapping.id}/archive`, {
                      method: 'POST',
                    });
                    await onSaved();
                  }}
                >
                  Archive
                </button>
              )}
            </div>
          </article>
        ))}
      {view === 'Reservations' &&
        reservations.map((reservation) => {
          const item = items.find((candidate) => candidate.id === reservation.itemId);
          return (
            <article className="lot" key={reservation.id}>
              <strong>
                {item?.name ?? reservation.itemId} · {reservation.status.replaceAll('_', ' ')}
              </strong>
              <span>
                {fmt(reservation.consumedQuantity)} / {fmt(reservation.quantity)}{' '}
                {reservation.baseUnitSnapshot}
              </span>
              <small>
                {reservation.sourceEventType.replaceAll('_', ' ')}
                {reservation.expiresAt
                  ? ` · expires ${new Date(reservation.expiresAt).toLocaleString()}`
                  : ''}
              </small>
              {['ACTIVE', 'PARTIALLY_CONSUMED'].includes(reservation.status) && (
                <button
                  onClick={async () => {
                    const response = await fetch(
                      `/api/inventory/usage/reservations/${reservation.id}/release`,
                      {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          reason: 'Released from usage workspace',
                          idempotencyKey: crypto.randomUUID(),
                        }),
                      },
                    );
                    if (response.ok) await onSaved();
                  }}
                >
                  Release
                </button>
              )}
            </article>
          );
        })}
      {view === 'Usage History' && (
        <div className="inventory__table-wrap">
          <table>
            <thead>
              <tr>
                <th>Occurred</th>
                <th>Source</th>
                <th>Event</th>
                <th>Status</th>
                <th>Components</th>
                <th>Patient</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td>{new Date(event.occurredAt).toLocaleString()}</td>
                  <td>
                    {event.sourceRecordType} · {event.sourceRecordId}
                  </td>
                  <td>{humanize(event.eventType)}</td>
                  <td>
                    <InventoryStatus value={event.status} />
                  </td>
                  <td>{event.lines.length}</td>
                  <td>{event.patientId ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {view === 'Lot Traceability' && (
        <div>
          <p>
            Choose a tracked lot from an item record to review the clinical source, patient, and
            deduction history tied to it.
          </p>
          {items.flatMap((item) =>
            item.lots.map((lot) => (
              <article className="lot" key={lot.id}>
                <strong>{item.name}</strong>
                <span>{lot.lotNumber ? `Lot ${lot.lotNumber}` : 'Lot number not recorded'}</span>
                <small>
                  {lot.stockLocation.name} · {fmt(lot.quantity)} on hand ·{' '}
                  {lot.expirationDate
                    ? `expires ${new Date(lot.expirationDate).toLocaleDateString()}`
                    : 'no expiration recorded'}
                </small>
                <a className="button-secondary" href={`/api/inventory/usage/lots/${lot.id}/export`}>
                  Export trace
                </a>
              </article>
            )),
          )}
          {!items.some((item) => item.lots.length) && (
            <EmptyState
              title="No tracked lots"
              detail="Lots will appear here after lot-tracked inventory is received."
            />
          )}
        </div>
      )}
      {creating && (
        <Modal
          title="Create usage mapping"
          className="inventory-modal--usage-mapping"
          onClose={() => {
            setCreating(false);
            setMappingSource(null);
          }}
        >
          <form
            className="inventory-form usage-mapping-form"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const item = items.find((candidate) => candidate.id === form.get('itemId'));
              const response = await fetch('/api/inventory/usage/mappings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  sourceType: form.get('sourceType'),
                  sourceReference: form.get('sourceReference'),
                  organizationWide: false,
                  reservationBehavior: form.get('reservationBehavior'),
                  deductionEvent: form.get('deductionEvent'),
                  lotSelectionPolicy: form.get('lotSelectionPolicy'),
                  activate: true,
                  components: [
                    {
                      itemId: form.get('itemId'),
                      quantityRule: 'FIXED',
                      fixedQuantity: form.get('quantity'),
                      quantityUnit: item?.conversions.find((conversion) => conversion.isActive)
                        ?.stockUnit,
                      optional: false,
                      staffConfirmationRequired: false,
                      lotSelectionRequired: item?.lotTracking ?? false,
                      fallbackBehavior: 'NONE',
                      wasteAllowance: '0',
                      physicalKit: false,
                      deductComponents: true,
                      sequence: 0,
                    },
                  ],
                }),
              });
              if (!response.ok)
                return setError((await response.json()).message ?? 'Unable to create mapping');
              setCreating(false);
              await onSaved();
            }}
          >
            <p className="usage-mapping-form__intro form-wide">
              Connect a clinical or retail action to the physical inventory it consumes. The mapping
              activates after review.
            </p>
            <h3>Source action</h3>
            <label>
              Action name
              <input
                name="sourceReference"
                placeholder="e.g. SNAP 4Dx Plus"
                defaultValue={mappingSource ? humanize(mappingSource.eventType) : ''}
                required
              />
            </label>
            <label>
              Source type
              <select
                name="sourceType"
                defaultValue={
                  mappingSource?.eventType.includes('LAB_TEST')
                    ? 'LAB_TEST'
                    : mappingSource?.eventType.includes('PROCEDURE')
                      ? 'PROCEDURE'
                      : 'MEDICATION'
                }
              >
                {[
                  'MEDICATION',
                  'VACCINE',
                  'LAB_TEST',
                  'PROCEDURE',
                  'SURGERY',
                  'TREATMENT',
                  'RETAIL_SALE',
                  'SERVICE',
                  'BUNDLE',
                ].map((value) => (
                  <option key={value} value={value}>
                    {humanize(value)}
                  </option>
                ))}
              </select>
            </label>
            <h3>Inventory deduction</h3>
            <label>
              Physical component
              <select name="itemId" required>
                {items
                  .filter((item) => item.inventoryTracked && item.status === 'ACTIVE')
                  .map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Quantity consumed
              <input name="quantity" type="number" min="0.000001" step="any" required />
            </label>
            <label>
              Deduction event
              <select name="deductionEvent" defaultValue={mappingSource?.eventType}>
                <option value="MEDICATION_ADMINISTERED">Medication administered</option>
                <option value="PRESCRIPTION_DISPENSED">Prescription dispensed</option>
                <option value="VACCINE_ADMINISTERED">Vaccine administered</option>
                <option value="LAB_TEST_COMPLETED">Laboratory test completed</option>
                <option value="PROCEDURE_COMPLETED">Procedure completed</option>
                <option value="RETAIL_SALE_FINALIZED">Retail sale finalized</option>
              </select>
            </label>
            <details className="usage-mapping-form__advanced form-wide">
              <summary>Advanced reservation and lot settings</summary>
              <div>
                <label>
                  Reservation behavior
                  <select name="reservationBehavior">
                    <option value="OFF">Off</option>
                    <option value="WHEN_ORDERED">When ordered</option>
                    <option value="WHEN_APPROVED">When approved</option>
                    <option value="WHEN_PREPARED">When prepared</option>
                    <option value="MANUAL">Manual</option>
                  </select>
                </label>
                <label>
                  Lot selection
                  <select name="lotSelectionPolicy">
                    <option value="FEFO">First expiring, first out</option>
                    <option value="FIFO">First received, first out</option>
                    <option value="MANUAL">Manual</option>
                    <option value="LOCATION_PRIORITY">Location priority</option>
                  </select>
                </label>
              </div>
            </details>
            <footer className="usage-mapping-form__footer">
              <button type="button" onClick={() => setCreating(false)}>
                Cancel
              </button>
              <button className="button-primary">Review & activate</button>
            </footer>
          </form>
        </Modal>
      )}
    </section>
  );
}

function ControlledPanel({
  overview,
  profiles,
  ledger,
  discrepancies,
  reports,
  counts,
  corrections,
  disposals,
  authorizations,
  locations,
  onSaved,
}: {
  overview: ControlledOverview | null;
  profiles: ControlledProfile[];
  ledger: ControlledLedger[];
  discrepancies: ControlledDiscrepancy[];
  reports: ControlledReport[];
  counts: ControlledCount[];
  corrections: ControlledCorrection[];
  disposals: ControlledDisposal[];
  authorizations: ControlledAuthorization[];
  locations: Location[];
  onSaved: () => Promise<void>;
}) {
  const [view, setView] = useState('Overview'),
    [recording, setRecording] = useState(false);
  const metrics = overview?.metrics ?? {};
  return (
    <section className="inventory__panel">
      <div className="inventory__section-heading">
        <div>
          <h2>Controlled Substances</h2>
          <p>
            Compliance-supporting records. Confirm requirements with the clinic’s registrant or
            legal advisor.
          </p>
        </div>
        <button className="button-primary" onClick={() => setRecording(true)}>
          Record Activity
        </button>
      </div>
      <div className="inventory__views">
        {[
          'Overview',
          'Running Log',
          'Counts',
          'Discrepancies',
          'Waste & Disposal',
          'Reports',
          'Settings',
        ].map((v) => (
          <button key={v} className={view === v ? 'is-active' : ''} onClick={() => setView(v)}>
            {v}
          </button>
        ))}
      </div>
      {view === 'Overview' && (
        <>
          <div className="inventory__metrics">
            <Metric label="Open Discrepancies" value={metrics.openDiscrepancies} />
            <Metric label="Pending Approval" value={metrics.pendingApproval} />
            <Metric label="Unresolved Waste" value={metrics.unresolvedWaste} />
            <Metric label="External Reports Awaiting Action" value={metrics.externalReports} />
            <Metric label="Suspicious Balances" value={metrics.suspiciousBalances} />
          </div>
          <h3>Needs Attention</h3>
          {discrepancies
            .filter((d) => !['RESOLVED', 'CLOSED_NO_ADJUSTMENT'].includes(d.status))
            .map((d) => (
              <p key={d.id}>
                <strong>{d.caseNumber}</strong> · {d.severity} · {d.status.replaceAll('_', ' ')} —
                Investigate
              </p>
            ))}
          {reports
            .filter((r) =>
              ['ACTION_REQUIRED', 'CORRECTION_REQUIRED', 'REJECTED_EXTERNALLY'].includes(r.status),
            )
            .map((r) => (
              <p key={r.id}>
                <strong>{r.type.replaceAll('_', ' ')}</strong> · {r.status.replaceAll('_', ' ')} —
                Review external filing requirements
              </p>
            ))}
        </>
      )}
      {view === 'Running Log' && <ControlledLog rows={ledger} />}{' '}
      {view === 'Discrepancies' && (
        <div>
          {discrepancies.map((d) => (
            <article className="lot" key={d.id}>
              <strong>
                {d.caseNumber} · {d.severity}
              </strong>
              <span>{d.classification.replaceAll('_', ' ')}</span>
              <small>{d.status.replaceAll('_', ' ')} · Original records remain immutable</small>
            </article>
          ))}
        </div>
      )}
      {view === 'Reports' && (
        <div>
          <p>
            Reporting preparation and status tracking. Exporting does not mark a record as filed.
          </p>
          {reports.map((r) => (
            <article className="lot" key={r.id}>
              <strong>{r.type.replaceAll('_', ' ')}</strong>
              <span>
                {r.jurisdiction} · {r.authority}
              </span>
              <small>
                {r.status.replaceAll('_', ' ')}
                {r.externalConfirmationNumber ? ` · ${r.externalConfirmationNumber}` : ''}
              </small>
            </article>
          ))}
          {profiles[0] && (
            <div className="inventory__actions">
              <a
                className="button-secondary"
                href={`/api/inventory/controlled/exports?registrationId=${profiles[0].registrationId}&format=csv&reportType=CONTROLLED_RUNNING_BALANCE`}
              >
                Export CSV
              </a>
              <a
                className="button-secondary"
                href={`/api/inventory/controlled/exports?registrationId=${profiles[0].registrationId}&format=pdf&reportType=CONTROLLED_RUNNING_BALANCE`}
              >
                Export inspection PDF
              </a>
            </div>
          )}
        </div>
      )}
      {view === 'Settings' && (
        <div>
          <h3>Controlled profiles</h3>
          {profiles.map((p) => (
            <p key={p.id}>
              <strong>{p.item.name}</strong> · Schedule {p.federalSchedule} · {p.strength} ·{' '}
              {p.containers.length} active container(s)
            </p>
          ))}
          <h3>Active authorizations</h3>
          {authorizations.map((a) => (
            <p key={a.id}>
              <strong>{a.authorizationType.replaceAll('_', ' ')}</strong> · user {a.userId} ·{' '}
              {a.status}
            </p>
          ))}
        </div>
      )}
      {view === 'Counts' && (
        <ControlledCounts counts={counts} profiles={profiles} onSaved={onSaved} />
      )}
      {view === 'Waste & Disposal' && (
        <ControlledDisposals disposals={disposals} onSaved={onSaved} />
      )}
      {view === 'Running Log' && corrections.length > 0 && (
        <div>
          <h3>Correction requests</h3>
          {corrections.map((c) => (
            <article className="lot" key={c.id}>
              <strong>
                {c.number} · {c.status.replaceAll('_', ' ')}
              </strong>
              <span>{c.reason.replaceAll('_', ' ')}</span>
              <small>{c.explanation}</small>
            </article>
          ))}
        </div>
      )}
      {recording && (
        <ControlledEventEditor
          profiles={profiles}
          locations={locations}
          onClose={() => setRecording(false)}
          onSaved={onSaved}
        />
      )}
    </section>
  );
}
function ControlledCounts({
  counts,
  profiles,
  onSaved,
}: {
  counts: ControlledCount[];
  profiles: ControlledProfile[];
  onSaved: () => Promise<void>;
}) {
  const [active, setActive] = useState<ControlledCount | null>(null);
  const start = async () => {
    if (!profiles[0]) return;
    const r = await fetch('/api/inventory/controlled/counts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        registrationId: profiles[0].registrationId,
        type: 'PERIODIC_COUNT',
        timing: 'CLOSE_OF_BUSINESS',
        blindCount: true,
        dualReviewRequired: true,
      }),
    });
    if (r.ok) await onSaved();
  };
  const open = async (id: string) => {
    const r = await fetch(`/api/inventory/controlled/counts/${id}`);
    if (r.ok) setActive(await r.json());
  };
  const action = async (path: string, body?: Record<string, unknown>) => {
    if (!active) return;
    const r = await fetch(`/api/inventory/controlled/counts/${active.id}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
    if (r.ok) {
      await onSaved();
      await open(active.id);
    }
  };
  return (
    <div>
      <div className="inventory__section-heading">
        <p>Blind, container-level counts with distinct reconciliation review.</p>
        <button className="button-primary" onClick={start} disabled={!profiles.length}>
          Start controlled count
        </button>
      </div>
      {counts.map((c) => (
        <article className="lot" key={c.id}>
          <strong>
            {c.number} · {c.status.replaceAll('_', ' ')}
          </strong>
          <span>
            {c.type.replaceAll('_', ' ')} · {c.lines.length} container(s)
          </span>
          <button className="button-secondary" onClick={() => open(c.id)}>
            Open
          </button>
        </article>
      ))}
      {active && (
        <Modal title={active.number} onClose={() => setActive(null)}>
          <div className="inventory__form">
            <p>
              <strong>{active.status.replaceAll('_', ' ')}</strong> · frozen count scope
            </p>
            {active.lines.map((line) => (
              <form
                key={line.id}
                className="lot"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  await fetch(
                    `/api/inventory/controlled/counts/${active.id}/lines/${line.id}/entries`,
                    {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        quantity: f.get('quantity'),
                        exact: true,
                        method: 'MANUAL',
                        attestation: 'I attest this controlled count is accurate.',
                      }),
                    },
                  );
                  await open(active.id);
                }}
              >
                <strong>{line.containerSnapshot?.containerNumber ?? 'Controlled container'}</strong>
                <span>
                  Schedule {line.profileSnapshot?.federalSchedule ?? '—'} ·{' '}
                  {line.profileSnapshot?.baseUnit ?? 'units'}
                </span>
                <input
                  name="quantity"
                  type="number"
                  step="any"
                  min="0"
                  defaultValue={line.finalQuantity ?? ''}
                  required
                />
                <button className="button-secondary">Record count</button>
              </form>
            ))}
            {['IN_PROGRESS', 'RECOUNT_REQUIRED'].includes(active.status) && (
              <button className="button-primary" onClick={() => action('submit')}>
                Submit for review
              </button>
            )}
            {['SUBMITTED', 'SECOND_REVIEW_REQUIRED'].includes(active.status) && (
              <button
                className="button-primary"
                onClick={() =>
                  action('reviews', {
                    decision: 'APPROVE',
                    idempotencyKey: crypto.randomUUID(),
                    attestation: 'I attest that I independently reviewed this count.',
                  })
                }
              >
                Approve review
              </button>
            )}
            {active.status === 'APPROVED' && (
              <button
                className="button-primary"
                onClick={() =>
                  action('post', {
                    idempotencyKey: crypto.randomUUID(),
                    attestation: 'I attest that this approved count may be posted.',
                  })
                }
              >
                Post approved count
              </button>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
function ControlledDisposals({
  disposals,
  onSaved,
}: {
  disposals: ControlledDisposal[];
  onSaved: () => Promise<void>;
}) {
  const act = async (id: string, action: string) => {
    const witnessIds =
      action === 'COMPLETE'
        ? [
            window.prompt('First witness user ID') ?? '',
            window.prompt('Second witness user ID') ?? '',
          ]
        : [];
    const reason = ['REJECT', 'CANCEL'].includes(action) ? window.prompt('Reason') : undefined;
    if (witnessIds.some((w) => !w) || (['REJECT', 'CANCEL'].includes(action) && !reason)) return;
    const r = await fetch(`/api/inventory/controlled/disposals/${id}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        reason,
        witnessIds,
        idempotencyKey: crypto.randomUUID(),
        attestation: 'I attest that this controlled disposal action is accurate.',
      }),
    });
    if (r.ok) await onSaved();
  };
  return (
    <div>
      <p>
        Pending disposal quantities are held from use until witnessed completion or cancellation.
      </p>
      {disposals.map((d) => (
        <article className="lot" key={d.id}>
          <strong>
            {d.number} · {d.status.replaceAll('_', ' ')}
          </strong>
          <span>
            {d.reason.replaceAll('_', ' ')} · {d.proposedMethod}
          </span>
          <small>{d.lines.map((l) => `${fmt(l.quantity)} ${l.unitSnapshot}`).join(', ')}</small>
          <div className="inventory__actions">
            {d.status === 'DRAFT' && <button onClick={() => act(d.id, 'SUBMIT')}>Submit</button>}
            {d.status === 'PENDING_APPROVAL' && (
              <button onClick={() => act(d.id, 'APPROVE')}>Approve</button>
            )}
            {['READY_FOR_COMPLETION', 'APPROVED', 'SCHEDULED'].includes(d.status) && (
              <button onClick={() => act(d.id, 'COMPLETE')}>Complete with witnesses</button>
            )}
            {!['COMPLETED', 'CANCELLED'].includes(d.status) && (
              <button onClick={() => act(d.id, 'CANCEL')}>Cancel</button>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
function ControlledLog({ rows }: { rows: ControlledLedger[] }) {
  return (
    <div className="inventory__table-wrap">
      <table>
        <thead>
          <tr>
            <th>Date and Time</th>
            <th>Item</th>
            <th>Schedule</th>
            <th>Event</th>
            <th>Patient / Reference</th>
            <th>Container</th>
            <th>Change</th>
            <th>Running Balance</th>
            <th>Witness</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{new Date(r.eventAt).toLocaleString()}</td>
              <td>
                <strong>{r.profile.item.name}</strong>
                <small>{r.entryNumber}</small>
              </td>
              <td>{r.profile.federalSchedule}</td>
              <td>{r.eventType.replaceAll('_', ' ')}</td>
              <td>{r.patientId || '—'}</td>
              <td>{r.container?.containerNumber || 'Lot level'}</td>
              <td>
                {Number(r.quantityChanged) > 0 ? '+' : ''}
                {fmt(r.quantityChanged)}
              </td>
              <td>{fmt(r.quantityAfter)}</td>
              <td>{r.witnessId ? 'Recorded' : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function ControlledEventEditor({
  profiles,
  locations,
  onClose,
  onSaved,
}: {
  profiles: ControlledProfile[];
  locations: Location[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [profileId, setProfileId] = useState(profiles[0]?.id ?? ''),
    [eventType, setEventType] = useState('ADMINISTERED'),
    [error, setError] = useState('');
  const profile = profiles.find((p) => p.id === profileId);
  return (
    <Modal title="Record controlled activity" onClose={onClose}>
      <form
        className="inventory__form"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const r = await fetch('/api/inventory/controlled/ledger', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              idempotencyKey: crypto.randomUUID(),
              registrationId: profile?.registrationId,
              profileId,
              containerId: f.get('containerId') || null,
              stockLocationId: f.get('stockLocationId'),
              eventType,
              quantity: f.get('quantity'),
              eventAt: new Date().toISOString(),
              reason: f.get('reason'),
              patientId: f.get('patientId') || null,
              clientId: f.get('clientId') || null,
              visitId: f.get('visitId') || null,
              prescriptionReference: f.get('prescriptionReference') || null,
              authorizingVeterinarianId: f.get('veterinarianId') || null,
              witnessId: f.get('witnessId') || null,
              notes: f.get('notes') || null,
              attestation: String(f.get('attestation')),
            }),
          });
          if (!r.ok)
            return setError((await r.json()).message || 'Unable to post controlled activity');
          await onSaved();
          onClose();
        }}
      >
        <label>
          Controlled item
          <select value={profileId} onChange={(e) => setProfileId(e.target.value)} required>
            {profiles.map((p) => (
              <option value={p.id} key={p.id}>
                {p.item.name} · Schedule {p.federalSchedule}
              </option>
            ))}
          </select>
        </label>
        <label>
          Event
          <select value={eventType} onChange={(e) => setEventType(e.target.value)}>
            <option value="RECEIVED">Received</option>
            <option value="ADMINISTERED">Administered</option>
            <option value="DISPENSED">Dispensed</option>
            <option value="WASTED_DURING_ADMINISTRATION">Administration waste</option>
            <option value="ACCIDENTAL_LOSS">Accidental loss</option>
            <option value="QUARANTINED">Quarantined</option>
            <option value="RELEASED_FROM_QUARANTINE">Released from quarantine</option>
            <option value="DISPOSAL_PENDING">Place into pending disposal</option>
            <option value="DISPOSED">Complete witnessed disposal</option>
          </select>
        </label>
        <label>
          Container
          <select name="containerId" required>
            <option value="">Choose container</option>
            {profile?.containers.map((c) => (
              <option value={c.id} key={c.id}>
                {c.containerNumber} · {fmt(c.currentQuantity)} {profile.baseUnit}
              </option>
            ))}
          </select>
        </label>
        <label>
          Secure location
          <select name="stockLocationId" required>
            {locations
              .filter((l) => profile?.secureStockLocationIds.includes(l.id))
              .map((l) => (
                <option value={l.id} key={l.id}>
                  {l.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Quantity ({profile?.baseUnit})
          <input name="quantity" type="number" step="any" min="0.000001" required />
        </label>
        <label>
          Reason
          <input name="reason" required />
        </label>
        {['ADMINISTERED', 'DISPENSED'].includes(eventType) && (
          <>
            <label>
              Patient ID
              <input name="patientId" required />
            </label>
            <label>
              Authorizing veterinarian user ID
              <input name="veterinarianId" required />
            </label>
          </>
        )}
        {eventType === 'ADMINISTERED' && (
          <label>
            Visit ID
            <input name="visitId" required />
          </label>
        )}
        {eventType === 'DISPENSED' && (
          <>
            <label>
              Client ID
              <input name="clientId" required />
            </label>
            <label>
              Prescription reference
              <input name="prescriptionReference" required />
            </label>
          </>
        )}
        {['WASTED_DURING_ADMINISTRATION', 'ACCIDENTAL_LOSS', 'DISPOSED'].includes(eventType) && (
          <label>
            Distinct authorized witness user ID
            <input name="witnessId" required />
          </label>
        )}
        <label>
          Notes
          <textarea name="notes" />
        </label>
        <label>
          <input
            name="attestation"
            type="checkbox"
            value="I deliberately confirm this controlled-substance record is accurate."
            required
          />{' '}
          I confirm this record is accurate to the best of my knowledge.
        </label>
        <p>No external filing or invoice action will be performed automatically.</p>
        {error && <p className="inventory__error">{error}</p>}
        <div className="inventory__actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button-primary">Post immutable record</button>
        </div>
      </form>
    </Modal>
  );
}
function CountsPanel({
  counts,
  onOpen,
}: {
  counts: CountSummary[];
  onOpen: (count: CountSummary) => void;
}) {
  const [view, setView] = useState('Active Counts');
  const shown = counts.filter((c) =>
    view === 'Active Counts'
      ? ['DRAFT', 'IN_PROGRESS'].includes(c.status)
      : view === 'Needs Review'
        ? ['SUBMITTED', 'RECOUNT_REQUIRED', 'APPROVED'].includes(c.status)
        : view === 'Completed'
          ? ['POSTED', 'CANCELLED'].includes(c.status)
          : false,
  );
  return (
    <section className="inventory__panel">
      <div className="inventory__section-heading">
        <div>
          <h2>Inventory Counts</h2>
          <p>Frozen physical counts with reconciliation against ongoing ledger activity.</p>
        </div>
      </div>
      <div className="inventory__views">
        {['Active Counts', 'Needs Review', 'Completed'].map((v) => (
          <button key={v} className={view === v ? 'is-active' : ''} onClick={() => setView(v)}>
            {v}
          </button>
        ))}
      </div>
      <div className="inventory__table-wrap">
        <table>
          <thead>
            <tr>
              <th>Count</th>
              <th>Type</th>
              <th>Status</th>
              <th>Progress</th>
              <th>Recounts</th>
              <th>Started</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((c) => (
              <tr
                key={c.id}
                tabIndex={0}
                onClick={() => onOpen(c)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') onOpen(c);
                }}
              >
                <td>
                  <strong>{c.number}</strong>
                  {c.blindCount && <span className="inventory-tag">Blind count</span>}
                </td>
                <td>{humanize(c.countType)}</td>
                <td>
                  <InventoryStatus value={c.status} />
                </td>
                <td>
                  <span>
                    {c.progress.counted} of {c.progress.total}
                  </span>
                  <span className="inventory-progress">
                    <span
                      style={{
                        width: `${c.progress.total ? (c.progress.counted / c.progress.total) * 100 : 0}%`,
                      }}
                    />
                  </span>
                </td>
                <td>{c.progress.recounts}</td>
                <td>{c.startedAt ? new Date(c.startedAt).toLocaleString() : 'Not started'}</td>
              </tr>
            ))}
            {!shown.length && (
              <tr>
                <td colSpan={6}>
                  <EmptyState
                    title={`No ${view.toLowerCase()}`}
                    detail="Counts will appear here as they move through reconciliation."
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
function StartCount({
  locations,
  onClose,
  onStarted,
}: {
  locations: Location[];
  onClose: () => void;
  onStarted: (id: string) => Promise<void>;
}) {
  const [error, setError] = useState('');
  return (
    <Modal title="Start inventory count" onClose={onClose}>
      <form
        className="inventory__form"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget),
            type = String(f.get('countType')),
            locationId = String(f.get('locationId') || '');
          const r = await fetch('/api/inventory/counts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              countType: type,
              configuration: {
                stockLocationIds: type === 'LOCATION' && locationId ? [locationId] : [],
                itemIds: [],
                itemTypes: [],
                routes: [],
                therapeuticClasses: [],
                tags: [],
                lotIds: [],
                includeDescendants: f.get('descendants') === 'on',
                includeZeroBalance: f.get('zero') === 'on',
                includeQuarantined: f.get('quarantine') === 'on',
              },
              blindCount: f.get('blind') === 'on',
              requireAllLines: true,
              requireRecount: true,
              varianceQuantityThreshold: String(f.get('quantityThreshold') || '2'),
              variancePercentThreshold: String(f.get('percentThreshold') || '10'),
              notes: f.get('notes') || null,
              startImmediately: true,
            }),
          });
          if (!r.ok) return setError((await r.json()).message || 'Unable to start count');
          const count = await r.json();
          await onStarted(count.id);
          onClose();
        }}
      >
        <label>
          Count type
          <select name="countType" required>
            <option value="FULL">Full inventory</option>
            <option value="LOCATION">Location</option>
            <option value="CATEGORY">Category</option>
            <option value="CYCLE">Cycle count</option>
            <option value="LOT">Lot count</option>
          </select>
        </label>
        <label>
          Stock-location branch
          <select name="locationId">
            <option value="">All locations</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input name="descendants" type="checkbox" defaultChecked /> Include descendant locations
        </label>
        <label>
          <input name="blind" type="checkbox" /> Blind count
        </label>
        <label>
          <input name="zero" type="checkbox" /> Include zero balances
        </label>
        <label>
          <input name="quarantine" type="checkbox" /> Include quarantined lots
        </label>
        <label>
          Recount quantity threshold
          <input name="quantityThreshold" type="number" step="any" defaultValue="2" />
        </label>
        <label>
          Recount percentage threshold
          <input name="percentThreshold" type="number" step="any" defaultValue="10" />
        </label>
        <label>
          Notes
          <textarea name="notes" />
        </label>
        <p>Controlled inventory is excluded and must use the later compliance workflow.</p>
        {error && <p className="inventory__error">{error}</p>}
        <div className="inventory__actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button-primary">Freeze scope and start</button>
        </div>
      </form>
    </Modal>
  );
}
function CountWorkspace({
  count,
  onRefresh,
  onExit,
}: {
  count: CountDetail;
  onRefresh: () => Promise<void>;
  onExit: () => void;
}) {
  const [scan, setScan] = useState(''),
    [highlight, setHighlight] = useState(''),
    [error, setError] = useState('');
  const action = async (path: string, body?: unknown) => {
    const r = await fetch(`/api/inventory/counts/${count.id}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!r.ok) {
      setError((await r.json()).message || 'Count action failed');
      return false;
    }
    await onRefresh();
    return true;
  };
  const scanLookup = async () => {
    if (!scan.trim()) return;
    const r = await fetch(
      `/api/inventory/counts/${count.id}/scan?query=${encodeURIComponent(scan.trim())}`,
    );
    if (!r.ok) return setError((await r.json()).message || 'Scan lookup failed');
    const result = await r.json(),
      matches = result.exact.length ? result.exact : result.matches;
    if (matches.length === 1) {
      setHighlight(matches[0].id);
      document.querySelector<HTMLInputElement>(`[data-line="${matches[0].id}"]`)?.focus();
      setScan('');
    } else if (matches.length > 1)
      setError('Multiple location or lot lines match. Choose the correct line below.');
    else setError('Barcode, SKU, or item was not found in this frozen count scope.');
  };
  return (
    <section className="inventory__panel">
      <div className="inventory__section-heading">
        <div>
          <button onClick={onExit}>← Counts</button>
          <h2>{count.number}</h2>
          <p>
            {count.countType} · {count.status.replaceAll('_', ' ')}{' '}
            {count.blindCount ? '· Blind count' : ''}
          </p>
        </div>
        <div className="inventory__actions">
          {['IN_PROGRESS', 'RECOUNT_REQUIRED'].includes(count.status) && (
            <button className="button-primary" onClick={() => void action('submit')}>
              Submit Count
            </button>
          )}
          {count.status === 'SUBMITTED' && count.permissions.canApprove && (
            <button className="button-primary" onClick={() => void action('approve')}>
              Approve
            </button>
          )}
          {count.status === 'APPROVED' && count.permissions.canPost && (
            <button
              className="button-primary"
              onClick={() => void action('post', { idempotencyKey: crypto.randomUUID() })}
            >
              Post Adjustments
            </button>
          )}
        </div>
      </div>
      {error && <div className="inventory__error">{error}</div>}
      <form
        className="inventory__search"
        onSubmit={(e) => {
          e.preventDefault();
          void scanLookup();
        }}
      >
        <span>Scan or search</span>
        <input
          data-count-scan
          autoFocus
          value={scan}
          onChange={(e) => {
            setScan(e.target.value);
            setError('');
          }}
          placeholder="Scan barcode, enter SKU, or item name"
        />
        <button>Find</button>
      </form>
      <p>
        {count.lines.filter((l) => l.finalCountedQuantity !== null).length} of {count.lines.length}{' '}
        lines counted
      </p>
      <div className="inventory__table-wrap">
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Lot</th>
              {count.lines.some((l) => l.expectedQuantitySnapshot !== undefined) && (
                <th>Expected</th>
              )}
              <th>Counted</th>
              <th>Variance</th>
              <th>Status</th>
              <th>Review</th>
            </tr>
          </thead>
          <tbody>
            {count.lines.map((line) => (
              <CountLineRow
                key={line.id}
                count={count}
                line={line}
                highlighted={highlight === line.id}
                onSaved={onRefresh}
                onReview={(actionName) =>
                  action(`lines/${line.id}/review`, {
                    action: actionName,
                    reason: actionName === 'EXCLUDE' ? 'Excluded during variance review' : null,
                  })
                }
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
function CountLineRow({
  count,
  line,
  highlighted,
  onSaved,
  onReview,
}: {
  count: CountDetail;
  line: CountLine;
  highlighted: boolean;
  onSaved: () => Promise<void>;
  onReview: (a: 'ACCEPT' | 'EXCLUDE') => Promise<boolean>;
}) {
  const [quantity, setQuantity] = useState(line.finalCountedQuantity ?? ''),
    [saving, setSaving] = useState(false);
  return (
    <tr className={highlighted ? 'is-selected' : ''}>
      <td>
        <strong>{line.itemNameSnapshot}</strong>
        <small>
          {line.skuSnapshot || 'No SKU'} · {line.baseUnitSnapshot}
        </small>
      </td>
      <td>{line.lotNumberSnapshot || '—'}</td>
      {line.expectedQuantitySnapshot !== undefined && <td>{fmt(line.expectedQuantitySnapshot)}</td>}
      <td>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setSaving(true);
            const r = await fetch(`/api/inventory/counts/${count.id}/lines/${line.id}/entries`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ quantity, method: 'MANUAL' }),
            });
            setSaving(false);
            if (r.ok) await onSaved();
          }}
        >
          <input
            data-line={line.id}
            inputMode="decimal"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            aria-label={`Count ${line.itemNameSnapshot}`}
            required
          />
          <button disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </form>
      </td>
      <td>{line.varianceQuantity === undefined ? 'Hidden' : fmt(line.varianceQuantity)}</td>
      <td>{line.status.replaceAll('_', ' ')}</td>
      <td>
        {['SUBMITTED', 'RECOUNT_REQUIRED'].includes(count.status) &&
          count.permissions.canApprove && (
            <>
              <button onClick={() => void onReview('ACCEPT')}>Accept</button>
              <button onClick={() => void onReview('EXCLUDE')}>Exclude</button>
            </>
          )}
      </td>
    </tr>
  );
}
function VendorsPanel({ vendors }: { vendors: Vendor[] }) {
  return (
    <section className="inventory__panel">
      <div className="inventory__section-heading">
        <div>
          <h2>Vendors</h2>
          <p>Suppliers and item package mappings.</p>
        </div>
      </div>
      <div className="inventory__table-wrap">
        <table>
          <thead>
            <tr>
              <th>Vendor</th>
              <th>Contact</th>
              <th>Mapped items</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {vendors.map((v) => (
              <tr key={v.id}>
                <td>
                  <strong>{v.name}</strong>
                </td>
                <td>{v.contactName || v.email || v.phone || '—'}</td>
                <td>{v.items.length}</td>
                <td>
                  <InventoryStatus value={v.archivedAt ? 'ARCHIVED' : 'ACTIVE'} />
                </td>
              </tr>
            ))}
            {!vendors.length && (
              <tr>
                <td colSpan={4}>
                  <EmptyState
                    title="No vendors found"
                    detail="Add a vendor to connect purchasing contacts and package mappings."
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
function OrdersPanel({
  orders,
  onReceive,
  onChanged,
}: {
  orders: Order[];
  onReceive: (o: Order) => void;
  onChanged: () => Promise<void>;
}) {
  const transition = async (o: Order, action: string) => {
    const r = await fetch(`/api/inventory/orders/${o.id}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, expectedStatus: o.status }),
    });
    if (!r.ok) window.alert((await r.json()).message || 'Unable to update order');
    else await onChanged();
  };
  return (
    <section className="inventory__panel">
      <h2>Purchase Orders</h2>
      <div className="inventory__table-wrap">
        <table>
          <thead>
            <tr>
              <th>PO</th>
              <th>Vendor</th>
              <th>Status</th>
              <th>Expected</th>
              <th>Lines</th>
              <th>Outstanding</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td>
                  <strong>{o.number}</strong>
                </td>
                <td>{o.vendor.name}</td>
                <td>
                  <InventoryStatus value={o.status} />
                </td>
                <td>{o.expectedDate ? new Date(o.expectedDate).toLocaleDateString() : '—'}</td>
                <td>{o.lines.length}</td>
                <td className="inventory-number">
                  {o.lines.reduce((n, l) => n + Number(l.outstandingQuantity), 0)}
                </td>
                <td>
                  {o.status === 'DRAFT' && (
                    <button onClick={() => void transition(o, 'SUBMIT')}>Submit</button>
                  )}
                  {o.status === 'PENDING_APPROVAL' && (
                    <button onClick={() => void transition(o, 'APPROVE')}>Approve</button>
                  )}
                  {o.status === 'APPROVED' && (
                    <button onClick={() => void transition(o, 'MARK_ORDERED')}>Mark ordered</button>
                  )}
                  {['ORDERED', 'PARTIALLY_RECEIVED'].includes(o.status) && (
                    <button onClick={() => onReceive(o)}>Receive</button>
                  )}
                </td>
              </tr>
            ))}
            {!orders.length && (
              <tr>
                <td colSpan={7}>
                  <EmptyState
                    title="No purchase orders found"
                    detail="Create a purchase order or clear the purchasing search."
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
function VendorEditor({
  items,
  onClose,
  onSaved,
}: {
  items: Item[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [error, setError] = useState('');
  return (
    <Modal title="Add vendor" onClose={onClose}>
      <form
        className="inventory__form"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const r = await fetch('/api/inventory/vendors', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: f.get('name'),
              contactName: f.get('contactName') || null,
              email: f.get('email') || null,
              phone: f.get('phone') || null,
            }),
          });
          if (!r.ok) return setError((await r.json()).message || 'Unable to add vendor');
          const vendor = await r.json();
          const item = items.find((i) => i.id === f.get('itemId')),
            c = item?.conversions.find((x) => x.isActive);
          if (item && c) {
            const m = await fetch(`/api/inventory/vendors/${vendor.id}/items`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                itemId: item.id,
                purchaseUnit: c.purchaseUnit,
                stockUnit: c.stockUnit,
                purchaseToStock: c.purchaseToStock,
                packageCost: f.get('packageCost') || null,
                isPreferred: true,
              }),
            });
            if (!m.ok)
              return setError((await m.json()).message || 'Vendor saved, but item mapping failed');
          }
          await onSaved();
          onClose();
        }}
      >
        <label>
          Vendor name
          <input name="name" required />
        </label>
        <label>
          Contact
          <input name="contactName" />
        </label>
        <label>
          Email
          <input name="email" type="email" />
        </label>
        <label>
          Phone
          <input name="phone" />
        </label>
        <label>
          Initial item mapping
          <select name="itemId">
            <option value="">None</option>
            {items
              .filter((i) => i.conversions.some((c) => c.isActive))
              .map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Package cost
          <input name="packageCost" type="number" min="0" step="0.01" />
        </label>
        {error && <p className="inventory__error">{error}</p>}
        <div className="inventory__actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button-primary">Save vendor</button>
        </div>
      </form>
    </Modal>
  );
}
function OrderEditor({
  vendors,
  items,
  onClose,
  onSaved,
}: {
  vendors: Vendor[];
  items: Item[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [error, setError] = useState('');
  return (
    <Modal title="New purchase order" onClose={onClose}>
      <form
        className="inventory__form"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const r = await fetch('/api/inventory/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              vendorId: f.get('vendorId'),
              expectedDate: f.get('expectedDate') || null,
              lines: [
                {
                  itemId: f.get('itemId'),
                  orderedQuantity: f.get('quantity'),
                  unitCost: f.get('cost') || null,
                },
              ],
            }),
          });
          if (!r.ok) return setError((await r.json()).message || 'Unable to create order');
          await onSaved();
          onClose();
        }}
      >
        <label>
          Vendor
          <select name="vendorId" required>
            <option value="">Choose vendor</option>
            {vendors
              .filter((v) => !v.archivedAt)
              .map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Item
          <select name="itemId" required>
            <option value="">Choose item</option>
            {items
              .filter((i) => i.status === 'ACTIVE' && i.inventoryTracked)
              .map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Packages
          <input name="quantity" type="number" min="0.000001" step="any" required />
        </label>
        <label>
          Package cost
          <input name="cost" type="number" min="0" step="0.01" />
        </label>
        <label>
          Expected date
          <input name="expectedDate" type="date" />
        </label>
        {error && <p className="inventory__error">{error}</p>}
        <div className="inventory__actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button-primary">Create draft</button>
        </div>
      </form>
    </Modal>
  );
}
function ReceiveEditor({
  order,
  vendors,
  items,
  locations,
  onClose,
  onSaved,
}: {
  order: Order | null;
  vendors: Vendor[];
  items: Item[];
  locations: Location[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [error, setError] = useState('');
  const line = order?.lines.find((l) => Number(l.outstandingQuantity) > 0);
  return (
    <Modal title={order ? `Receive ${order.number}` : 'Receive inventory'} onClose={onClose}>
      <form
        className="inventory__form"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const item = items.find((i) => i.id === (line?.itemId || f.get('itemId')));
          const conversion = item?.conversions.find((c) => c.isActive);
          const r = await fetch('/api/inventory/receipts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              idempotencyKey: crypto.randomUUID(),
              vendorId: order
                ? vendors.find((v) => v.name === order.vendor.name)?.id
                : f.get('vendorId'),
              purchaseOrderId: order?.id || null,
              reference: f.get('reference') || null,
              lines: [
                {
                  purchaseOrderLineId: line?.id || null,
                  itemId: line?.itemId || f.get('itemId'),
                  stockLocationId: f.get('locationId'),
                  packageQuantity: f.get('quantity'),
                  purchaseToStock: line?.conversionSnapshot || conversion?.purchaseToStock || '1',
                  purchaseUnit: line?.purchaseUnitSnapshot || conversion?.purchaseUnit || 'package',
                  stockUnit: line?.stockUnitSnapshot || conversion?.stockUnit || 'unit',
                  lotNumber: f.get('lotNumber') || null,
                  expirationDate: f.get('expirationDate') || null,
                  quarantinedQuantity: f.get('quarantined') || '0',
                },
              ],
            }),
          });
          if (!r.ok) return setError((await r.json()).message || 'Unable to post receipt');
          await onSaved();
          onClose();
        }}
      >
        {!order && (
          <>
            <label>
              Vendor
              <select name="vendorId" required>
                {vendors
                  .filter((v) => !v.archivedAt)
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Item
              <select name="itemId" required>
                {items
                  .filter((i) => i.inventoryTracked)
                  .map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
              </select>
            </label>
          </>
        )}{' '}
        {line && (
          <p>
            <strong>{line.itemNameSnapshot}</strong> · {fmt(line.outstandingQuantity)}{' '}
            {line.purchaseUnitSnapshot} outstanding
          </p>
        )}
        <label>
          Destination
          <select name="locationId" required>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Packages received
          <input
            name="quantity"
            type="number"
            step="any"
            min="0.000001"
            max={line?.outstandingQuantity}
            required
          />
        </label>
        <label>
          Lot number
          <input name="lotNumber" />
        </label>
        <label>
          Expiration
          <input name="expirationDate" type="date" />
        </label>
        <label>
          Quarantined base quantity
          <input name="quarantined" type="number" step="any" min="0" defaultValue="0" />
        </label>
        <label>
          Packing slip / invoice
          <input name="reference" />
        </label>
        {error && <p className="inventory__error">{error}</p>}
        <div className="inventory__actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button-primary">Post receipt</button>
        </div>
      </form>
    </Modal>
  );
}
function TransferEditor({
  items,
  locations,
  onClose,
  onSaved,
}: {
  items: Item[];
  locations: Location[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [error, setError] = useState('');
  return (
    <Modal title="Transfer stock" onClose={onClose}>
      <form
        className="inventory__form"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const r = await fetch('/api/inventory/transfers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              idempotencyKey: crypto.randomUUID(),
              reason: f.get('reason') || null,
              lines: [
                {
                  itemId: f.get('itemId'),
                  sourceStockLocationId: f.get('source'),
                  destinationStockLocationId: f.get('destination'),
                  quantity: f.get('quantity'),
                },
              ],
            }),
          });
          if (!r.ok) return setError((await r.json()).message || 'Unable to transfer stock');
          await onSaved();
          onClose();
        }}
      >
        <label>
          Item
          <select name="itemId" required>
            {items
              .filter((i) => i.inventoryTracked && !i.controlledSubstance)
              .map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({fmt(i.available)} available)
                </option>
              ))}
          </select>
        </label>
        <label>
          Source
          <select name="source" required>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Destination
          <select name="destination" required>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Base quantity
          <input name="quantity" type="number" min="0.000001" step="any" required />
        </label>
        <label>
          Reason
          <input name="reason" />
        </label>
        <p>Controlled-item transfers require the later compliance workflow.</p>
        {error && <p className="inventory__error">{error}</p>}
        <div className="inventory__actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button-primary">Post transfer</button>
        </div>
      </form>
    </Modal>
  );
}
function ItemDrawer({
  item,
  activity,
  onClose,
  onEdit,
  onDuplicate,
  onDelete,
  onArchive,
  onAdjust,
}: {
  item: Item;
  activity: Activity[];
  onClose: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onArchive: () => void;
  onAdjust: () => void;
}) {
  const [tab, setTab] = useState('Overview');
  return (
    <div
      className="drawer-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside className="item-drawer">
        <header>
          <div>
            <span>{item.primaryType}</span>
            <h2>{item.name}</h2>
            <p>
              {item.sku || 'No SKU'} {item.status !== 'ACTIVE' && <strong> · ARCHIVED</strong>}
            </p>
          </div>
          <button aria-label="Close drawer" onClick={onClose}>
            ×
          </button>
        </header>
        <nav>
          {['Overview', 'Stock & Lots', 'Pricing', 'Documents', 'Counts', 'Activity'].map((t) => (
            <button className={tab === t ? 'is-active' : ''} key={t} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </nav>
        <div className="item-drawer__body">
          {tab === 'Overview' && (
            <>
              <p>{[item.strength, item.form, item.route].filter(Boolean).join(' · ')}</p>
              <p>Stock unit: <strong>{item.conversions.find((conversion) => conversion.isActive)?.stockUnit || 'Not configured'}</strong></p>
              <div className="stock-summary">
                <span>
                  On Hand<strong>{fmt(item.onHand)}</strong>
                </span>
                <span>
                  Available<strong>{fmt(item.available)}</strong>
                </span>
                <span>
                  Quarantined<strong>{fmt(item.quarantined)}</strong>
                </span>
                <span>
                  Expired<strong>{fmt(item.expired)}</strong>
                </span>
              </div>
              <p className="inventory-stock-explanation">Available stock excludes reserved, quarantined, and expired quantities.</p>
              <dl>
                <dt>Status</dt>
                <dd>{item.status}</dd>
                <dt>Description</dt>
                <dd>{item.description || '—'}</dd>
                <dt>Route</dt>
                <dd>{item.route || '—'}</dd>
                <dt>Therapeutic class</dt>
                <dd>{item.therapeuticClass || '—'}</dd>
                <dt>Species</dt>
                <dd>{item.species.join(', ') || '—'}</dd>
                <dt>Tags</dt>
                <dd>{item.tags.join(', ') || '—'}</dd>
              </dl>
            </>
          )}
          {tab === 'Stock & Lots' && (
            <>
              {item.lots.map((l) => (
                <article className="lot" key={l.id}>
                  <strong>{l.lotNumber || 'Unlabeled lot'}</strong>
                  <span>
                    {l.stockLocation.name} · {fmt(l.quantity)}
                  </span>
                  <small>
                    {l.expirationDate
                      ? `Expires ${new Date(l.expirationDate).toLocaleDateString()}`
                      : 'No expiration'}{' '}
                    · {l.status}
                  </small>
                </article>
              ))}
              {!item.lots.length && <p>No lots recorded.</p>}
            </>
          )}
          {tab === 'Pricing' && (
            <dl>
              <dt>Retail price</dt>
              <dd>{item.retailPrice ? `$${Number(item.retailPrice).toFixed(2)}` : 'Not set'}</dd>
            </dl>
          )}
          {tab === 'Documents' &&
            (item.documents.length ? (
              item.documents.map((d) => (
                <a key={d.id} href={d.url}>
                  {d.name} · {d.type}
                </a>
              ))
            ) : (
              <p>No documents attached.</p>
            ))}
          {tab === 'Counts' && (
            <div>
              <h3>Recent count history</h3>
              {item.countHistory?.length ? (
                item.countHistory.map((line) => (
                  <p key={line.id}>
                    <strong>{line.session.number}</strong> · counted{' '}
                    {fmt(line.finalCountedQuantity)}
                    {' · '}expected {fmt(line.expectedQuantitySnapshot)} · variance{' '}
                    {fmt(line.varianceQuantity)} ·{' '}
                    {line.session.postedAt
                      ? new Date(line.session.postedAt).toLocaleDateString()
                      : '—'}
                  </p>
                ))
              ) : (
                <p>No posted count history.</p>
              )}
            </div>
          )}
          {tab === 'Activity' && <ActivityTable rows={activity} />}
        </div>
        <footer>
          {item.permissions.canEdit && <button onClick={onEdit}>Edit</button>}
          {item.inventoryTracked && item.status === 'ACTIVE' ? <button onClick={onAdjust}>Adjust stock</button> : null}
          <button onClick={onDuplicate}>Duplicate</button>
          <details className="drawer-more">
            <summary>More</summary>
            <div>
              {item.permissions.canArchive && <button onClick={onArchive}>Archive</button>}
              {item.permissions.canDelete && <button onClick={onDelete}>Delete unused item</button>}
            </div>
          </details>
        </footer>
      </aside>
    </div>
  );
}
function Modal({
  title,
  onClose,
  children,
  className = '',
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);
  const modal = (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className={`inventory-modal ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="inventory-modal-title"
      >
        <header>
          <h2 id="inventory-modal-title">{title}</h2>
          <button onClick={onClose} aria-label={`Close ${title}`}>
            ×
          </button>
        </header>
        {children}
      </section>
    </div>
  );
  return createPortal(modal, document.body);
}
function ItemEditor({
  mode,
  item,
  onClose,
  onSaved,
}: {
  mode: 'add' | 'edit' | 'duplicate';
  item?: Item;
  onClose: () => void;
  onSaved: (savedId: string) => Promise<void>;
}) {
  const [stocked, setStocked] = useState(item?.inventoryTracked ?? true);
  const [type, setType] = useState(item?.primaryType ?? 'MEDICATION');
  const [dirty, setDirty] = useState(false);
  const [formError, setFormError] = useState('');
  const activeConversion = item?.conversions.find((conversion) => conversion.isActive);
  const close = () => {
    if (!dirty || window.confirm('Discard unsaved inventory item changes?')) onClose();
  };
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError('');
    const f = new FormData(e.currentTarget);
    const value = (name: string) => String(f.get(name) || '').trim() || null;
    const body = {
      name: value('name'),
      primaryType: type,
      status: mode === 'edit' ? item?.status : 'ACTIVE',
      sku: value('sku'),
      description: value('description'),
      brand: value('brand'),
      manufacturer: value('manufacturer'),
      strength: type === 'MEDICATION' ? value('strength') : null,
      form: type === 'MEDICATION' ? value('form') : null,
      defaultFrequency: type === 'MEDICATION' ? value('defaultFrequency') : null,
      route: type === 'MEDICATION' || type === 'VACCINE' ? value('route') : null,
      therapeuticClass:
        type === 'MEDICATION' || type === 'VACCINE' ? value('therapeuticClass') : null,
      species:
        value('species')
          ?.split(',')
          .map((entry) => entry.trim())
          .filter(Boolean) ?? [],
      tags:
        value('tags')
          ?.split(',')
          .map((entry) => entry.trim())
          .filter(Boolean) ?? [],
      billable: f.get('billable') === 'on',
      inventoryTracked: stocked,
      taxable: f.get('taxable') === 'on',
      lotTracking: stocked && f.get('lotTracking') === 'on',
      expirationTracking: stocked && f.get('expirationTracking') === 'on',
      controlledSubstance: type === 'MEDICATION' && f.get('controlled') === 'on',
      deaSchedule: value('deaSchedule'),
      retailPrice: value('retailPrice'),
      markupPercent: value('markupPercent'),
      minimumStock: value('minimumStock'),
      maximumStock: value('maximumStock'),
      reorderPoint: value('reorderPoint'),
      reorderQuantity: value('reorderQuantity'),
      internalNotes: value('internalNotes'),
      barcodes: mode === 'edit' ? undefined : [],
      conversion:
        value('stockUnit') && value('purchaseUnit')
          ? {
              purchaseUnit: value('purchaseUnit'),
              stockUnit: value('stockUnit'),
              dispenseUnit: value('dispenseUnit'),
              billingUnit: value('billingUnit'),
              purchaseToStock: value('purchaseToStock') || '1',
              stockToDispense: value('stockToDispense'),
              stockToBilling: value('stockToBilling'),
            }
          : mode === 'edit'
            ? undefined
            : null,
    };
    const url = mode === 'edit' ? `/api/inventory/items/${item?.id}` : '/api/inventory/items';
    const response = await fetch(url, {
      method: mode === 'edit' ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const failure = await response.json();
      setFormError(
        Array.isArray(failure.message)
          ? failure.message.join(' · ')
          : (failure.message ?? 'Unable to save item'),
      );
      return;
    }
    const saved = (await response.json()) as { id: string };
    setDirty(false);
    onClose();
    await onSaved(saved.id);
  };
  const initialName = mode === 'duplicate' ? `${item?.name} — Copy` : (item?.name ?? '');
  const initialSku = mode === 'duplicate' ? '' : (item?.sku ?? '');
  return (
    <Modal
      title={mode === 'edit' ? 'Edit Item' : mode === 'duplicate' ? 'Duplicate Item' : 'Add Item'}
      onClose={close}
      className="inventory-modal--item-editor"
    >
      <form className="inventory-form" onChange={() => setDirty(true)} onSubmit={submit}>
        <p className="item-editor__intro form-wide">
          Add the essential item details first. Stock controls and unit conversions can be refined
          here or from the item record later.
        </p>
        {formError && <div className="inventory__error form-wide">{formError}</div>}
        <h3>Basics</h3>
        <label>
          Item name
          <input required name="name" defaultValue={initialName} />
        </label>
        <label>
          Type
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {[
              'MEDICATION',
              'VACCINE',
              'DIAGNOSTIC',
              'SERVICE',
              'SUPPLY',
              'RETAIL',
              'FOOD',
              'OTHER',
            ].map((v) => (
              <option key={v} value={v}>
                {humanize(v)}
              </option>
            ))}
          </select>
        </label>
        <label>
          SKU
          <input
            name="sku"
            required={mode === 'duplicate' && Boolean(item?.sku)}
            defaultValue={initialSku}
          />
          {mode === 'duplicate' && item?.sku && <small>A new unique SKU is required.</small>}
        </label>
        <label>
          Brand
          <input name="brand" defaultValue={item?.brand ?? ''} />
        </label>
        <label>
          Manufacturer
          <input name="manufacturer" defaultValue={item?.manufacturer ?? ''} />
        </label>
        <label>
          Description
          <textarea name="description" defaultValue={item?.description ?? ''} />
        </label>
        {(type === 'MEDICATION' || type === 'VACCINE') && (
          <>
            <h3>Clinical and usage classification</h3>
            <label>
              Route
              <input name="route" defaultValue={item?.route ?? ''} />
            </label>
            <label>
              Therapeutic class
              <input name="therapeuticClass" defaultValue={item?.therapeuticClass ?? ''} />
            </label>
            <label>
              Species
              <input name="species" defaultValue={item?.species.join(', ')} />
              <small>Separate multiple species with commas.</small>
            </label>
            <label>
              Tags
              <input name="tags" defaultValue={item?.tags.join(', ')} />
              <small>Separate multiple tags with commas.</small>
            </label>
            {type === 'MEDICATION' && (
              <>
                <label>
                  Strength
                  <input name="strength" defaultValue={item?.strength ?? ''} placeholder="100 mg" />
                </label>
                <label>
                  Form
                  <input name="form" defaultValue={item?.form ?? ''} placeholder="Tablet" />
                </label>
                <label>
                  Default frequency
                  <input
                    name="defaultFrequency"
                    defaultValue={item?.defaultFrequency ?? ''}
                    placeholder="Every 12 hours"
                  />
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    name="controlled"
                    defaultChecked={item?.controlledSubstance}
                  />{' '}
                  Controlled substance
                </label>
                <label>
                  DEA schedule
                  <input name="deaSchedule" defaultValue={item?.deaSchedule ?? ''} />
                </label>
              </>
            )}
          </>
        )}
        <h3>Billing and unit conversion</h3>
        <label className="check">
          <input type="checkbox" name="billable" defaultChecked={item?.billable} /> Billable
        </label>
        <label>
          Retail price
          <input name="retailPrice" inputMode="decimal" defaultValue={item?.retailPrice ?? ''} />
        </label>
        <label>
          Markup %
          <input
            name="markupPercent"
            inputMode="decimal"
            defaultValue={item?.markupPercent ?? ''}
            placeholder="0"
          />
        </label>
        <label className="check">
          <input type="checkbox" name="taxable" defaultChecked={item?.taxable} /> Taxable
        </label>
        <label>
          Purchase unit
          <input name="purchaseUnit" defaultValue={activeConversion?.purchaseUnit ?? ''} />
        </label>
        <label>
          Stock/base unit
          <input name="stockUnit" defaultValue={activeConversion?.stockUnit ?? ''} />
        </label>
        <label>
          Purchase → stock factor
          <input name="purchaseToStock" defaultValue={activeConversion?.purchaseToStock ?? '1'} />
        </label>
        <label>
          Dispense unit
          <input name="dispenseUnit" defaultValue={activeConversion?.dispenseUnit ?? ''} />
        </label>
        <label>
          Billing unit
          <input name="billingUnit" defaultValue={activeConversion?.billingUnit ?? ''} />
        </label>
        <h3>Stock configuration</h3>
        <label className="check">
          <input checked={stocked} onChange={(e) => setStocked(e.target.checked)} type="checkbox" />{' '}
          Inventory tracked
        </label>
        {stocked && (
          <>
            <label className="check">
              <input type="checkbox" name="lotTracking" defaultChecked={item?.lotTracking} /> Track
              lots
            </label>
            <label className="check">
              <input
                type="checkbox"
                name="expirationTracking"
                defaultChecked={item?.expirationTracking}
              />{' '}
              Track expiration
            </label>
            <label>
              Minimum stock
              <input name="minimumStock" defaultValue={item?.minimumStock ?? ''} />
            </label>
            <label>
              Maximum stock
              <input name="maximumStock" defaultValue={item?.maximumStock ?? ''} />
            </label>
            <label>
              Reorder point
              <input name="reorderPoint" defaultValue={item?.reorderPoint ?? ''} />
            </label>
            <label>
              Reorder quantity
              <input name="reorderQuantity" defaultValue={item?.reorderQuantity ?? ''} />
            </label>
          </>
        )}
        <h3>Documents and notes</h3>
        {mode === 'duplicate' && <p className="form-wide">Documents are not copied by default.</p>}
        <label className="form-wide">
          Internal notes
          <textarea name="internalNotes" defaultValue={item?.internalNotes ?? ''} />
        </label>
        <footer className="item-editor__footer">
          <span>Required fields are marked by your browser.</span>
          <button type="button" onClick={close}>
            Cancel
          </button>
          <button className="button-primary">
            {mode === 'edit' ? 'Save changes' : 'Create item'}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
function AdjustStock({
  initialItemId,
  items,
  locations,
  onClose,
  onSaved,
  onError,
}: {
  initialItemId?: string | undefined;
  items: Item[];
  locations: Location[];
  onClose: () => void;
  onSaved: () => Promise<void>;
  onError: (e: string) => void;
}) {
  const [itemId, setItemId] = useState(
    initialItemId ?? items.find((i) => i.inventoryTracked && i.status === 'ACTIVE')?.id ?? '',
  );
  const [quantity, setQuantity] = useState('');
  const [locationId, setLocationId] = useState('');
  const [lotId, setLotId] = useState('');
  const [mode, setMode] = useState('DELTA');
  const [reason, setReason] = useState('CORRECTION');
  const item = items.find((i) => i.id === itemId);
  const current = Number(item?.balances.find((balance) => balance.stockLocation.id === locationId && (balance.lotId ?? '') === lotId)?.onHand ?? 0);
  const stockUnit = item?.conversions.find((conversion) => conversion.isActive)?.stockUnit;
  const result = mode === 'COUNTED' ? Number(quantity || current) : current + Number(quantity || 0);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const r = await fetch('/api/inventory/adjustments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        itemId,
        stockLocationId: locationId,
        lotId: lotId || null,
        lotNumber: f.get('lotNumber') || null,
        expirationDate: f.get('expirationDate') || null,
        mode,
        quantity,
        reason,
        notes: f.get('notes') || null,
      }),
    });
    if (!r.ok) return onError((await r.json()).message ?? 'Unable to adjust stock');
    onClose();
    await onSaved();
  };
  return (
    <Modal title="Adjust Stock" onClose={onClose}>
      <form className="inventory-form" onSubmit={submit}>
        <label>
          Item
          <select required value={itemId} onChange={(e) => { setItemId(e.target.value); setLotId(''); }}>
            <option value="">Choose item</option>
            {items
              .filter((i) => i.inventoryTracked && i.status === 'ACTIVE')
              .map((i) => (
                <option value={i.id} key={i.id}>
                  {i.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Location
          <select required name="location" value={locationId} onChange={(event) => { setLocationId(event.target.value); setLotId(''); }}>
            <option value="">Choose location</option>
            {locations.map((l) => (
              <option value={l.id} key={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        {item?.lotTracking && (
          <>
            {item.lots.length > 0 && (
              <label>
                Existing lot
                <select name="lot" value={lotId} onChange={(event) => setLotId(event.target.value)}>
                  <option value="">Create another lot</option>
                  {item.lots.filter((lot) => lot.stockLocation.id === locationId).map((l) => (
                    <option value={l.id} key={l.id}>
                      {l.lotNumber}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Lot number
              <input name="lotNumber" />
            </label>
            {item.expirationTracking && (
              <label>
                Expiration
                <input name="expirationDate" type="date" />
              </label>
            )}
          </>
        )}
        <label>
          Adjustment
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="DELTA">Increase / decrease by</option>
            <option value="COUNTED">Set counted quantity</option>
          </select>
        </label>
        <label>
          Quantity{stockUnit ? ` (${stockUnit})` : ' — stock unit not configured'}
          <input
            required
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            inputMode="decimal"
            placeholder={mode === 'DELTA' ? 'Use - to decrease' : 'Counted quantity'}
          />
        </label>
        <label>
          Reason
          <select value={reason} onChange={(e) => setReason(e.target.value)}>
            {[
              'OPENING_BALANCE',
              'CORRECTION',
              'DAMAGED',
              'EXPIRED',
              'RETURNED',
              'INVENTORY_COUNT',
              'OTHER',
            ].map((value) => (
              <option value={value} key={value}>{value.replaceAll('_', ' ')}</option>
            ))}
          </select>
        </label>
        <label>
          Notes
          <textarea name="notes" required={reason === 'OTHER'} />
        </label>
        {locationId ? <div className={result < 0 ? 'adjust-preview adjust-preview--danger' : 'adjust-preview'}>
          <span>
            Previous <strong>{fmt(String(current))}</strong>
          </span>
          <span>
            Resulting <strong>{fmt(String(result))}</strong>
          </span>
          {result < 0 && <small>Negative inventory is blocked.</small>}
        </div> : <p>Select a stock location to preview the adjustment.</p>}
        <footer>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button-primary" disabled={result < 0}>
            Post adjustment
          </button>
        </footer>
      </form>
    </Modal>
  );
}
