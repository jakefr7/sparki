'use client';

import { useEffect, useId, useState } from 'react';

type MedicationOption = { id: string; name: string; primaryType: string; status: string; strength?: string | null };

export function DischargeMedicationName({ name, value, onChange }: { name: string; value: string; onChange: (value: string) => void }) {
  const listId = useId();
  const [options, setOptions] = useState<MedicationOption[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    setOptions([]);
    if (!value.trim()) return;
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/inventory/items?type=MEDICATION&status=ACTIVE&search=${encodeURIComponent(value.trim())}`, { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) return;
        const items = await response.json() as MedicationOption[];
        if (!controller.signal.aborted) setOptions(items.filter((item) => item.primaryType === 'MEDICATION' && item.status === 'ACTIVE').slice(0, 12));
      } catch { /* Manual entry remains available when the catalog cannot be reached. */ }
    }, 180);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [value]);
  return <><input name={name} value={value} required aria-required="true" autoComplete="off" list={listId} maxLength={1000} onChange={(event) => onChange(event.target.value)} /><datalist id={listId}>{options.map((item) => <option key={item.id} value={item.name}>{item.strength || item.name}</option>)}</datalist></>;
}
