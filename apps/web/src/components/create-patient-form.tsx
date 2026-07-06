'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { SEX_OPTIONS, SPECIES_OPTIONS } from '../lib/patient-types';

type DobMode = 'exact' | 'approximate';

function computeDateOfBirth(
  mode: DobMode,
  exactDate: string,
  approxAgeYears: string,
): string | undefined {
  if (mode === 'exact') {
    return exactDate || undefined;
  }
  const years = Number(approxAgeYears);
  if (!approxAgeYears || !Number.isFinite(years) || years <= 0) {
    return undefined;
  }
  const millisecondsOld = years * 365.25 * 24 * 60 * 60 * 1000;
  return new Date(Date.now() - millisecondsOld).toISOString();
}

export function CreatePatientForm({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [species, setSpecies] = useState<string>(SPECIES_OPTIONS[0]);
  const [otherSpecies, setOtherSpecies] = useState('');
  const [breed, setBreed] = useState('');
  const [sex, setSex] = useState<string>('Unknown');
  const [dobMode, setDobMode] = useState<DobMode>('approximate');
  const [exactDate, setExactDate] = useState('');
  const [approxAgeYears, setApproxAgeYears] = useState('');
  const [weight, setWeight] = useState('');
  const [color, setColor] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          species: species === 'Other' ? otherSpecies : species,
          breed: breed || undefined,
          sex,
          dateOfBirth: computeDateOfBirth(dobMode, exactDate, approxAgeYears),
          weight: weight ? Number(weight) : undefined,
          color: color || undefined,
          clients: [{ clientId, isPrimary: true }],
        }),
      });

      if (!response.ok) {
        setError('Could not create patient. Check the fields and try again.');
        setSubmitting(false);
        return;
      }

      const patient: { id: string } = await response.json();
      router.push(`/patients/${patient.id}`);
      router.refresh();
    } catch {
      setError('Could not reach the server. Try again.');
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="intake-form">
      <label htmlFor="patient-name">Patient name</label>
      <input
        id="patient-name"
        type="text"
        value={name}
        onChange={(event) => setName(event.target.value)}
        required
        maxLength={200}
        autoFocus
      />

      <label htmlFor="patient-species">Species</label>
      <select
        id="patient-species"
        value={species}
        onChange={(event) => setSpecies(event.target.value)}
      >
        {SPECIES_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      {species === 'Other' && (
        <input
          aria-label="Species (other)"
          type="text"
          value={otherSpecies}
          onChange={(event) => setOtherSpecies(event.target.value)}
          placeholder="Enter species"
          required
          maxLength={100}
        />
      )}

      <label htmlFor="patient-breed">Breed</label>
      <input
        id="patient-breed"
        type="text"
        value={breed}
        onChange={(event) => setBreed(event.target.value)}
        placeholder="Optional"
        maxLength={100}
      />

      <label htmlFor="patient-sex">Sex</label>
      <select id="patient-sex" value={sex} onChange={(event) => setSex(event.target.value)}>
        {SEX_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>

      <fieldset className="intake-form__fieldset">
        <legend>Age</legend>
        <label>
          <input
            type="radio"
            name="dob-mode"
            checked={dobMode === 'approximate'}
            onChange={() => setDobMode('approximate')}
          />
          Approximate age (years)
        </label>
        {dobMode === 'approximate' && (
          <input
            aria-label="Approximate age in years"
            type="number"
            min={0}
            step="0.5"
            value={approxAgeYears}
            onChange={(event) => setApproxAgeYears(event.target.value)}
          />
        )}
        <label>
          <input
            type="radio"
            name="dob-mode"
            checked={dobMode === 'exact'}
            onChange={() => setDobMode('exact')}
          />
          Exact date of birth
        </label>
        {dobMode === 'exact' && (
          <input
            aria-label="Date of birth"
            type="date"
            value={exactDate}
            onChange={(event) => setExactDate(event.target.value)}
          />
        )}
      </fieldset>

      <label htmlFor="patient-weight">Weight (lb)</label>
      <input
        id="patient-weight"
        type="number"
        min={0}
        step="0.1"
        value={weight}
        onChange={(event) => setWeight(event.target.value)}
        placeholder="Optional"
      />

      <label htmlFor="patient-color">Color / description</label>
      <input
        id="patient-color"
        type="text"
        value={color}
        onChange={(event) => setColor(event.target.value)}
        placeholder="Optional"
        maxLength={200}
      />

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <button type="submit" disabled={submitting}>
        {submitting ? 'Creating…' : 'Create Patient'}
      </button>
    </form>
  );
}
