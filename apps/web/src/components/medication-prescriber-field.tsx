'use client';

import { useEffect, useId, useState } from 'react';

type Doctor = { id: string; displayName: string; role: string; canOwnVisits: boolean };

/** Medication history attribution only. Prescription authorization remains separate. */
export function MedicationPrescriberField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [manual, setManual] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/staff?role=VETERINARIAN,OWNER', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('staff');
        const staff = (await response.json()) as Doctor[];
        if (!controller.signal.aborted)
          setDoctors(
            staff.filter((member) => member.role === 'VETERINARIAN' || member.canOwnVisits),
          );
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);
  const matched = doctors.find((doctor) => doctor.displayName === value);
  const showManual = manual || Boolean(value && !matched) || failed;
  return (
    <div className="medication-prescriber-field">
      <label htmlFor={id}>Prescribed by</label>
      <select
        id={id}
        value={showManual ? 'manual' : (matched?.id ?? '')}
        onChange={(event) => {
          const selected = event.target.value;
          setManual(selected === 'manual');
          if (selected !== 'manual')
            onChange(doctors.find((doctor) => doctor.id === selected)?.displayName ?? '');
        }}
      >
        <option value="">{loading ? 'Loading doctors…' : 'Select a doctor'}</option>
        {doctors.map((doctor) => (
          <option key={doctor.id} value={doctor.id}>
            {doctor.displayName}
          </option>
        ))}
        <option value="manual">Other or historical prescriber</option>
      </select>
      {showManual ? (
        <label>
          Prescriber name
          <input value={value} maxLength={200} onChange={(event) => onChange(event.target.value)} />
        </label>
      ) : null}
      {failed ? (
        <p className="front-desk-inline-hint">
          Could not load clinic doctors. You can enter the prescriber name.
        </p>
      ) : null}
    </div>
  );
}
