'use client';
import { useEffect, useId, useState } from 'react';
export type ReferralContact = {
  id: string;
  hospitalName: string;
  veterinarian: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
};
export type ProviderValue = { referring: ReferralContact | null; additional: ReferralContact[] };
export const emptyProviders: ProviderValue = { referring: null, additional: [] };
export function providerPayload(value: ProviderValue) {
  return {
    referringProviderId: value.referring?.id,
    additionalProviderIds: value.additional.map((contact) => contact.id),
  };
}
export function contactLabel(contact: ReferralContact) {
  return [contact.hospitalName, contact.veterinarian].filter(Boolean).join(' · ');
}
export function ProviderFields({
  value,
  onChange,
  onBusyChange,
}: {
  value: ProviderValue;
  onChange: (value: ProviderValue) => void;
  onBusyChange?: (pending: boolean) => void;
}) {
  const id = useId();
  const [search, setSearch] = useState<{ kind: 'referring' | 'additional'; query: string } | null>(
    null,
  );
  const [contacts, setContacts] = useState<ReferralContact[]>([]);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({
    hospitalName: '',
    veterinarian: '',
    email: '',
    phone: '',
    address: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    onBusyChange?.(adding || busy);
    return () => onBusyChange?.(false);
  }, [adding, busy, onBusyChange]);
  useEffect(() => {
    if (!search) return;
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => {
      fetch(`/api/referral-contacts?query=${encodeURIComponent(search.query)}`, {
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) throw new Error('Could not search hospitals. Try typing again.');
          const body = (await response.json()) as ReferralContact[];
          setContacts(body);
          setError('');
        })
        .catch((caught: Error) => {
          if (caught.name !== 'AbortError') setError(caught.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search]);
  function select(contact: ReferralContact) {
    if (search?.kind === 'additional')
      onChange({
        referring: value.referring?.id === contact.id ? null : value.referring,
        additional: [...value.additional.filter((item) => item.id !== contact.id), contact],
      });
    else
      onChange({
        referring: contact,
        additional: value.additional.filter((item) => item.id !== contact.id),
      });
    setSearch(null);
    setAdding(false);
    setError('');
  }
  async function add() {
    if (!draft.hospitalName.trim()) {
      setError('Enter a hospital name.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/referral-contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      if (!response.ok)
        throw new Error('Could not save the hospital. Check the email address and try again.');
      select((await response.json()) as ReferralContact);
      setDraft({ hospitalName: '', veterinarian: '', email: '', phone: '', address: '' });
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="provider-fields">
      {(['referring', 'additional'] as const).map((kind) => (
        <div key={kind}>
          <label htmlFor={`${id}-${kind}`}>
            {kind === 'referring' ? 'Referring vet' : 'Additional providers'}
          </label>
          <div className="provider-fields__selected">
            {(kind === 'referring'
              ? value.referring
                ? [value.referring]
                : []
              : value.additional
            ).map((contact) => (
              <span key={contact.id}>
                {contactLabel(contact)}{' '}
                <button
                  type="button"
                  aria-label={`Remove ${contactLabel(contact)}`}
                  onClick={() =>
                    onChange(
                      kind === 'referring'
                        ? { ...value, referring: null }
                        : {
                            ...value,
                            additional: value.additional.filter((item) => item.id !== contact.id),
                          },
                    )
                  }
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <input
            id={`${id}-${kind}`}
            value={search?.kind === kind ? search.query : ''}
            onFocus={() => {
              setSearch({ kind, query: '' });
              setAdding(false);
            }}
            onChange={(event) => {
              setSearch({ kind, query: event.target.value });
              setContacts([]);
              setAdding(false);
            }}
            placeholder="Search hospital or veterinarian"
            autoComplete="off"
          />
          {search?.kind === kind && !adding ? (
            <div className="provider-fields__results" aria-label={`${kind} hospital results`}>
              {loading ? (
                <p role="status">Searching hospitals…</p>
              ) : (
                contacts.map((contact) => (
                  <button type="button" key={contact.id} onClick={() => select(contact)}>
                    {contactLabel(contact)}
                    {contact.email ? ` · ${contact.email}` : ''}
                  </button>
                ))
              )}
              {!loading && !contacts.length ? <p>No hospitals found.</p> : null}
              <button
                type="button"
                onClick={() => {
                  setDraft((current) => ({ ...current, hospitalName: search.query }));
                  setAdding(true);
                }}
              >
                Add new hospital
              </button>
              <button
                type="button"
                onClick={() => {
                  setSearch(null);
                  setAdding(false);
                }}
              >
                Close search
              </button>
            </div>
          ) : null}
          {adding && search?.kind === kind ? (
            <fieldset disabled={busy} className="provider-fields__editor">
              <legend>New hospital</legend>
              {Object.entries({
                hospitalName: 'Hospital name',
                veterinarian: 'Veterinarian',
                email: 'Hospital email',
                phone: 'Hospital phone',
                address: 'Hospital address',
              }).map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input
                    autoFocus={key === 'hospitalName'}
                    value={draft[key as keyof typeof draft]}
                    onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
                    maxLength={key === 'address' ? 500 : key === 'phone' ? 50 : 200}
                  />
                </label>
              ))}
              <button type="button" className="button-primary" onClick={() => void add()}>
                Save hospital and select
              </button>
              <button type="button" className="button-secondary" onClick={() => setAdding(false)}>
                Cancel
              </button>
            </fieldset>
          ) : null}
        </div>
      ))}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
