'use client';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';

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
    stockLocation: { name: string };
  }>;
  balances: Array<{
    id: string;
    onHand: string;
    quarantined: string;
    expired: string;
    reserved: string;
    stockLocation: { name: string };
  }>;
  documents: Array<{ id: string; name: string; type: string; url: string }>;
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
const tabs = [
  'Overview',
  'Items',
  'Orders',
  'Counts',
  'Controlled',
  'Vendors',
  'Activity',
] as const;
const later = new Set(['Orders', 'Counts', 'Controlled', 'Vendors']);
const fmt = (n: string | null) =>
  n == null ? '—' : Number(n).toLocaleString(undefined, { maximumFractionDigits: 4 });

export function InventoryWorkspace() {
  const [tab, setTab] = useState<(typeof tabs)[number]>('Overview');
  const [items, setItems] = useState<Item[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [overview, setOverview] = useState<{
    metrics: Record<string, number>;
    attention: Array<{ itemId: string; itemName: string; message: string }>;
  } | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Item | null>(null);
  const [modal, setModal] = useState<'add' | 'edit' | 'duplicate' | 'adjust' | 'scan' | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    const q = new URLSearchParams();
    if (search) q.set('search', search);
    const [i, o, l, a] = await Promise.all([
      fetch(`/api/inventory/items?${q}`),
      fetch('/api/inventory/overview'),
      fetch('/api/inventory/locations'),
      fetch('/api/inventory/activity'),
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
  }, [search]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 180);
    return () => clearTimeout(timer);
  }, [load]);
  const metrics = overview?.metrics;
  return (
    <div className="inventory">
      <nav className="inventory__tabs" aria-label="Inventory sections">
        {tabs.map((name) => (
          <button
            key={name}
            className={tab === name ? 'is-active' : ''}
            onClick={() => setTab(name)}
          >
            {name}
          </button>
        ))}
      </nav>
      <div className="inventory__toolbar">
        <label className="inventory__search">
          <span>Search</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, SKU, or barcode"
          />
        </label>
        <select aria-label="Clinic location">
          <option>Current clinic</option>
        </select>
        <button onClick={() => setModal('scan')}>Scan</button>
        <button className="button-primary" onClick={() => setModal('add')}>
          Add Item
        </button>
        <button className="button-primary" onClick={() => setModal('adjust')}>
          Adjust Stock
        </button>
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
          <div className="inventory__metrics">
            <Metric label="Needs Attention" value={metrics?.needsAttention} />
            <Metric label="Low or Out of Stock" value={metrics?.lowOrOut} />
            <Metric label="Expiring Soon" value={metrics?.expiringSoon} />
            <Metric label="Total Active Items" value={metrics?.totalActiveItems} />
            <Metric label="Recent Adjustments" value={metrics?.recentAdjustments} />
          </div>
          <section className="inventory__panel">
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
      {tab === 'Items' && <ItemsTable items={items} onSelect={setSelected} />}
      {tab === 'Activity' && <ActivityTable rows={activity} />}
      {selected && (
        <ItemDrawer
          item={selected}
          activity={activity.filter((a) => a.item.name === selected.name)}
          onClose={() => setSelected(null)}
          onEdit={() => setModal('edit')}
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
            Camera barcode scanning is planned for a later inventory pass. You can search a barcode
            in the search field now.
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
          items={items}
          locations={locations}
          onClose={() => setModal(null)}
          onSaved={load}
          onError={setError}
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
function ItemsTable({ items, onSelect }: { items: Item[]; onSelect: (i: Item) => void }) {
  const [view, setView] = useState('All Items');
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
          view === 'All Items' ||
          (view === 'Low Stock' && i.attention.some((a) => a.includes('reorder'))) ||
          (view === 'Out of Stock' && i.attention.includes('Out of stock')) ||
          (view === 'Expiring' && i.attention.some((a) => /Expire/i.test(a))) ||
          (view === 'Medications' && i.primaryType === 'MEDICATION') ||
          (view === 'Vaccines' && i.primaryType === 'VACCINE') ||
          (view === 'Retail' && i.primaryType === 'RETAIL') ||
          (view === 'Supplies' && i.primaryType === 'SUPPLY') ||
          (view === 'Inactive' && i.status !== 'ACTIVE') ||
          (view === 'Needs Setup' && i.attention.some((a) => a.includes('setup'))),
      ),
    [items, view],
  );
  return (
    <section className="inventory__panel">
      <div className="inventory__views">
        {views.map((v) => (
          <button className={v === view ? 'is-active' : ''} key={v} onClick={() => setView(v)}>
            {v}
          </button>
        ))}
      </div>
      <div className="inventory__table-wrap">
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Type</th>
              <th>Available</th>
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
              <tr key={i.id} onClick={() => onSelect(i)}>
                <td>
                  <strong>{i.name}</strong>
                  <small>{i.sku || 'No SKU'}</small>
                </td>
                <td>{i.primaryType}</td>
                <td>{fmt(i.available)}</td>
                <td>{fmt(i.onHand)}</td>
                <td>
                  <span className={`status status--${i.status.toLowerCase()}`}>{i.status}</span>
                </td>
                <td>{i.nextExpiration ? new Date(i.nextExpiration).toLocaleDateString() : '—'}</td>
                <td>{i.primaryLocation || '—'}</td>
                <td>{i.retailPrice ? `$${Number(i.retailPrice).toFixed(2)}` : '—'}</td>
                <td>{i.attention[0] || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
function ActivityTable({ rows }: { rows: Activity[] }) {
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
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.createdAt).toLocaleString()}</td>
                <td>{r.item.name}</td>
                <td>{r.transactionType.replaceAll('_', ' ')}</td>
                <td>{fmt(r.previousBalance)}</td>
                <td>
                  {Number(r.quantityDelta) > 0 ? '+' : ''}
                  {fmt(r.quantityDelta)}
                </td>
                <td>{fmt(r.resultingBalance)}</td>
                <td>{r.stockLocation.name}</td>
                <td>{r.lot?.lotNumber || '—'}</td>
                <td>
                  {r.user.firstName} {r.user.lastName}
                </td>
                <td>{r.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
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
}: {
  item: Item;
  activity: Activity[];
  onClose: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onArchive: () => void;
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
          {['Overview', 'Stock & Lots', 'Pricing', 'Documents', 'Activity'].map((t) => (
            <button className={tab === t ? 'is-active' : ''} key={t} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </nav>
        <div className="item-drawer__body">
          {tab === 'Overview' && (
            <>
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
          {tab === 'Activity' && <ActivityTable rows={activity} />}
        </div>
        <footer>
          {item.permissions.canEdit && <button onClick={onEdit}>Edit</button>}
          <button disabled title="Use the page-level Adjust Stock action">
            Adjust Stock
          </button>
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
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section className="inventory-modal">
        <header>
          <h2>{title}</h2>
          <button onClick={onClose}>×</button>
        </header>
        {children}
      </section>
    </div>
  );
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
    >
      <form className="inventory-form" onChange={() => setDirty(true)} onSubmit={submit}>
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
              <option key={v}>{v}</option>
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
              Species, comma separated
              <input name="species" defaultValue={item?.species.join(', ')} />
            </label>
            <label>
              Tags, comma separated
              <input name="tags" defaultValue={item?.tags.join(', ')} />
            </label>
            {type === 'MEDICATION' && (
              <>
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
        <h3>Billing and units</h3>
        <label className="check">
          <input type="checkbox" name="billable" defaultChecked={item?.billable} /> Billable
        </label>
        <label>
          Retail price
          <input name="retailPrice" inputMode="decimal" defaultValue={item?.retailPrice ?? ''} />
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
        <footer>
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
  items,
  locations,
  onClose,
  onSaved,
  onError,
}: {
  items: Item[];
  locations: Location[];
  onClose: () => void;
  onSaved: () => Promise<void>;
  onError: (e: string) => void;
}) {
  const [itemId, setItemId] = useState(
    items.find((i) => i.inventoryTracked && i.status === 'ACTIVE')?.id || '',
  );
  const [quantity, setQuantity] = useState('');
  const [mode, setMode] = useState('DELTA');
  const [reason, setReason] = useState('CORRECTION');
  const item = items.find((i) => i.id === itemId);
  const current = Number(item?.onHand || 0);
  const result = mode === 'COUNTED' ? Number(quantity || current) : current + Number(quantity || 0);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const r = await fetch('/api/inventory/adjustments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        itemId,
        stockLocationId: f.get('location'),
        lotId: f.get('lot') || null,
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
          <select required value={itemId} onChange={(e) => setItemId(e.target.value)}>
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
          <select required name="location">
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
                <select name="lot">
                  <option value="">Create another lot</option>
                  {item.lots.map((l) => (
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
          Quantity
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
              <option key={value}>{value.replaceAll('_', ' ')}</option>
            ))}
          </select>
        </label>
        <label>
          Notes
          <textarea name="notes" required={reason === 'OTHER'} />
        </label>
        <div className={result < 0 ? 'adjust-preview adjust-preview--danger' : 'adjust-preview'}>
          <span>
            Previous <strong>{fmt(String(current))}</strong>
          </span>
          <span>
            Resulting <strong>{fmt(String(result))}</strong>
          </span>
          {result < 0 && <small>Negative inventory is blocked.</small>}
        </div>
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
