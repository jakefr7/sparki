'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { MedicationsSummary, PatientMedicationSummary } from '../lib/patient-types';

const EMPTY_FORM = {
  medicationName: '',
  genericName: '',
  strength: '',
  dose: '',
  route: '',
  frequency: '',
  instructions: '',
  startDate: '',
  endDate: '',
  status: 'Active',
  prescribedBy: '',
  source: '',
};

function dateLine(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function formFromMedication(medication: PatientMedicationSummary) {
  return {
    medicationName: medication.medicationName,
    genericName: medication.genericName ?? '',
    strength: medication.strength ?? '',
    dose: medication.dose ?? '',
    route: medication.route ?? '',
    frequency: medication.frequency ?? '',
    instructions: medication.instructions ?? '',
    startDate: medication.startDate ? medication.startDate.slice(0, 10) : '',
    endDate: medication.endDate ? medication.endDate.slice(0, 10) : '',
    status: medication.status,
    prescribedBy: medication.prescribedBy ?? '',
    source: medication.source ?? '',
  };
}

export function PatientMedicationsPanel({
  patientId,
  medications,
}: {
  patientId: string;
  medications: MedicationsSummary;
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [medicationSuggestionsOpen, setMedicationSuggestionsOpen] = useState(false);
  const [highlightedSuggestion, setHighlightedSuggestion] = useState(0);

  const activeMedications = medications.items.filter((item) => item.status === 'Active');
  const pastMedications = medications.items.filter((item) => item.status !== 'Active');
  const suggestions = useMemo(() => {
    const query = form.medicationName.trim().toLowerCase();
    if (!query) return [];
    return medications.catalog.filter((item) => item.toLowerCase().includes(query)).slice(0, 8);
  }, [form.medicationName, medications.catalog]);

  function updateField(field: keyof typeof EMPTY_FORM, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function selectMedication(value: string) {
    const selected = medications.catalog.find((item) => item.toLowerCase() === value.trim().toLowerCase());
    const genericName = selected?.split('/')[0]?.trim() ?? '';
    setForm((current) => ({
      ...current,
      medicationName: value,
      ...(selected ? { genericName } : {}),
    }));
    setMedicationSuggestionsOpen(false);
    setHighlightedSuggestion(0);
  }

  function updateMedicationName(value: string) {
    setForm((current) => ({ ...current, medicationName: value }));
    setHighlightedSuggestion(0);
  }

  function beginCreate() {
    setEditingId('new');
    setForm(EMPTY_FORM);
    setError(null);
  }

  function beginEdit(medication: PatientMedicationSummary) {
    setEditingId(medication.id);
    setForm(formFromMedication(medication));
    setError(null);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingId) return;
    setSaving(true);
    setError(null);

    const url =
      editingId === 'new'
        ? `/api/patients/${patientId}/medications`
        : `/api/patients/${patientId}/medications/${editingId}`;
    const method = editingId === 'new' ? 'POST' : 'PATCH';

    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!response.ok) throw new Error('medication save failed');
      setEditingId(null);
      router.refresh();
    } catch {
      setError('Something went wrong saving this medication. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function discontinue(medication: PatientMedicationSummary) {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/patients/${patientId}/medications/${medication.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Discontinued', endDate: new Date().toISOString() }),
      });
      if (!response.ok) throw new Error('medication discontinue failed');
      router.refresh();
    } catch {
      setError('Something went wrong updating this medication. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function MedicationList({ items, empty }: { items: PatientMedicationSummary[]; empty: string }) {
    if (items.length === 0) return <p className="empty-state">{empty}</p>;

    return (
      <div className="patient-medication-list">
        {items.map((medication) => (
          <article key={medication.id} className="patient-medication-card">
            <div>
              <div className="patient-medication-card__title">
                <strong>{medication.medicationName}</strong>
                <span className={`medication-status medication-status--${medication.status.toLowerCase()}`}>
                  {medication.status}
                </span>
              </div>
              {medication.genericName ? <small>Generic: {medication.genericName}</small> : null}
              {[medication.strength, medication.dose, medication.route, medication.frequency]
                .filter(Boolean)
                .join(' - ') ? (
                <p>{[medication.strength, medication.dose, medication.route, medication.frequency].filter(Boolean).join(' - ')}</p>
              ) : null}
              {medication.instructions ? <p>{medication.instructions}</p> : null}
              <small>
                {[dateLine(medication.startDate), dateLine(medication.endDate)].filter(Boolean).join(' - ') ||
                  'Dates not recorded'}
                {medication.prescribedBy ? ` - Prescribed by ${medication.prescribedBy}` : ''}
              </small>
            </div>
            <div className="patient-medication-card__actions">
              <button type="button" className="button-secondary" onClick={() => beginEdit(medication)}>
                Edit
              </button>
              {medication.status === 'Active' ? (
                <button type="button" className="button-secondary" onClick={() => discontinue(medication)} disabled={saving}>
                  Discontinue
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    );
  }

  return (
    <section className="profile-card profile-card--wide profile-card--medications" aria-labelledby="medications-heading">
      <div className="profile-card__header profile-card__header--with-action">
        <div>
          <p className="eyebrow">Medication profile</p>
          <h2 id="medications-heading">Medications</h2>
        </div>
        {!editingId ? (
          <button type="button" className="button-primary" onClick={beginCreate}>
            Add Medication
          </button>
        ) : null}
      </div>

      {editingId ? (
        <form className="patient-inline-form patient-medication-form" onSubmit={submit}>
          <label>
            Medication name
            <div className="patient-medication-autocomplete">
              <input
                value={form.medicationName}
                onChange={(event) => updateMedicationName(event.target.value)}
                onFocus={() => setMedicationSuggestionsOpen(true)}
                onBlur={() => window.setTimeout(() => setMedicationSuggestionsOpen(false), 120)}
                onKeyDown={(event) => {
                  if (!medicationSuggestionsOpen || suggestions.length === 0) return;
                  if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    setHighlightedSuggestion((current) => Math.min(current + 1, suggestions.length - 1));
                  } else if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    setHighlightedSuggestion((current) => Math.max(current - 1, 0));
                  } else if (event.key === 'Enter') {
                    event.preventDefault();
                    const suggestion = suggestions[highlightedSuggestion];
                    if (suggestion) selectMedication(suggestion);
                  } else if (event.key === 'Escape') {
                    setMedicationSuggestionsOpen(false);
                  }
                }}
                role="combobox"
                aria-expanded={medicationSuggestionsOpen && suggestions.length > 0}
                aria-controls="patient-medication-suggestions"
                aria-autocomplete="list"
                placeholder="Search veterinary medications"
                aria-describedby="patient-medication-catalog-hint"
                required
                autoFocus
              />
              {medicationSuggestionsOpen && suggestions.length > 0 ? (
                <div id="patient-medication-suggestions" className="patient-medication-suggestions" role="listbox">
                  {suggestions.map((item, index) => (
                    <button
                      key={item}
                      type="button"
                      role="option"
                      aria-selected={index === highlightedSuggestion}
                      className={index === highlightedSuggestion ? 'is-highlighted' : undefined}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectMedication(item)}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <small id="patient-medication-catalog-hint" className="patient-medication-form__hint">
              Start typing to see common veterinary medications. Selecting one fills its generic name.
            </small>
          </label>
          <div className="patient-inline-form__grid patient-inline-form__grid--three">
            <label>
              Generic name
              <input value={form.genericName} onChange={(event) => updateField('genericName', event.target.value)} />
            </label>
            <label>
              Strength
              <input value={form.strength} onChange={(event) => updateField('strength', event.target.value)} />
            </label>
            <label>
              Status
              <select value={form.status} onChange={(event) => updateField('status', event.target.value)}>
                <option value="Active">Active</option>
                <option value="Discontinued">Discontinued</option>
                <option value="Completed">Completed</option>
              </select>
            </label>
          </div>
          <div className="patient-inline-form__grid patient-inline-form__grid--three">
            <label>
              Dose
              <input value={form.dose} onChange={(event) => updateField('dose', event.target.value)} />
            </label>
            <label>
              Route
              <input value={form.route} onChange={(event) => updateField('route', event.target.value)} />
            </label>
            <label>
              Frequency
              <input value={form.frequency} onChange={(event) => updateField('frequency', event.target.value)} />
            </label>
          </div>
          <label>
            Instructions
            <textarea value={form.instructions} onChange={(event) => updateField('instructions', event.target.value)} rows={3} />
          </label>
          <div className="patient-inline-form__grid patient-inline-form__grid--three">
            <label>
              Start date
              <input type="date" value={form.startDate} onChange={(event) => updateField('startDate', event.target.value)} />
            </label>
            <label>
              End date
              <input type="date" value={form.endDate} onChange={(event) => updateField('endDate', event.target.value)} />
            </label>
            <label>
              Prescribed by
              <input value={form.prescribedBy} onChange={(event) => updateField('prescribedBy', event.target.value)} />
            </label>
          </div>
          <label>
            Source
            <input value={form.source} onChange={(event) => updateField('source', event.target.value)} />
          </label>
          {error && <p className="form-error">{error}</p>}
          <div className="front-desk-actions">
            <button type="button" className="button-secondary" onClick={() => setEditingId(null)} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="button-primary" disabled={saving}>
              {saving ? 'Saving...' : editingId === 'new' ? 'Add medication' : 'Save medication'}
            </button>
          </div>
        </form>
      ) : null}

      {error && !editingId ? <p className="form-error">{error}</p> : null}

      {!editingId ? (
        medications.items.length === 0 && !medications.legacyNotes ? (
          <div className="profile-compact-empty profile-compact-empty--roomy">
            <strong>No active medications on file</strong>
            <span>Add current prescriptions, supplements, or recently discontinued medications.</span>
          </div>
        ) : (
          <div className="patient-medications-sections">
            <section>
              <h3>Active medications</h3>
              <MedicationList items={activeMedications} empty="No active medications." />
            </section>
            <section>
              <h3>Past / discontinued</h3>
              <MedicationList items={pastMedications} empty="No past medications recorded." />
            </section>
            {medications.legacyNotes ? (
              <aside className="patient-medication-legacy">
                <strong>Legacy medication / allergy note</strong>
                <p>{medications.legacyNotes.notes}</p>
                <Link href={`/visits/${medications.legacyNotes.visitId}`}>
                  Updated {dateLine(medications.legacyNotes.recordedAt)}
                </Link>
              </aside>
            ) : null}
          </div>
        )
      ) : null}
    </section>
  );
}
