'use client';
import { useEffect, useState } from 'react';
type Breed = { species: string; key: string; name: string; isActive: boolean };
function BreedRow({ item, onSave }: { item: Breed; onSave: (item: Breed) => Promise<void> }) {
  const [name, setName] = useState(item.name);
  const [busy, setBusy] = useState(false);
  return (
    <div className="breed-settings__row">
      <input
        aria-label={`Breed name: ${item.name}`}
        value={name}
        maxLength={100}
        onChange={(event) => setName(event.target.value)}
      />
      <span>{item.isActive ? 'Active' : 'Hidden'}</span>
      <button
        type="button"
        disabled={busy || !name.trim()}
        onClick={async () => {
          setBusy(true);
          try {
            await onSave({ ...item, name });
          } finally {
            setBusy(false);
          }
        }}
      >
        Save name
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await onSave({ ...item, isActive: !item.isActive });
          } finally {
            setBusy(false);
          }
        }}
      >
        {item.isActive ? 'Hide' : 'Restore'}
      </button>
    </div>
  );
}
export function BreedSettingsSection() {
  const [items, setItems] = useState<Breed[]>([]);
  const [species, setSpecies] = useState('Dog');
  const [search, setSearch] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  async function load() {
    try {
      const response = await fetch('/api/patient-options/breeds');
      if (!response.ok) throw new Error('Could not load breed choices.');
      setItems(((await response.json()) as { choices: Breed[] }).choices);
      setError('');
    } catch (caught) {
      setError((caught as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function save(item: Omit<Breed, 'key'> & { key?: string }) {
    setError('');
    setStatus('');
    try {
      const response = await fetch('/api/patient-options/breeds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      });
      if (!response.ok) throw new Error('Could not save breed. Your edits are still here.');
      await load();
      setStatus('Breed choices saved.');
    } catch (caught) {
      setError((caught as Error).message);
    }
  }
  return (
    <section className="profile-card" aria-label="Breed choices">
      <h2>Breed choices</h2>
      <p>
        Search suggestions for patient forms. Rename, hide, or add choices for your clinic. Saved
        patient records stay unchanged.
      </p>
      <label>
        Species
        <input
          list="breed-species"
          value={species}
          onChange={(event) => setSpecies(event.target.value)}
          maxLength={100}
        />
      </label>
      <datalist id="breed-species">
        <option>Dog</option>
        <option>Cat</option>
      </datalist>
      <label>
        Search breeds
        <input value={search} onChange={(event) => setSearch(event.target.value)} />
      </label>
      <label>
        New breed name
        <input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} />
      </label>
      <button
        type="button"
        disabled={busy || !name.trim() || !species.trim()}
        onClick={async () => {
          setBusy(true);
          try {
            await save({ species: species.trim(), name: name.trim(), isActive: true });
          } finally {
            setBusy(false);
          }
        }}
      >
        Add breed
      </button>
      {error ? (
        <p role="alert" className="form-error">
          {error}{' '}
          <button type="button" onClick={() => void load()}>
            Retry
          </button>
        </p>
      ) : null}
      {status ? <p role="status">{status}</p> : null}
      <div className="breed-settings__list">
        {items
          .filter(
            (item) =>
              item.species.toLowerCase() === species.toLowerCase() &&
              item.name.toLowerCase().includes(search.toLowerCase()),
          )
          .map((item) => (
            <BreedRow key={`${item.species}:${item.key}`} item={item} onSave={save} />
          ))}
      </div>
      <p>
        Default dog names: <a href="https://www.akc.org/dog-breeds/">AKC</a>. Default cat names:{' '}
        <a href="https://cfa.org/breeds/">CFA</a>. Mixed, domestic, and unknown choices are also
        included.
      </p>
    </section>
  );
}
