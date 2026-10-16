'use client';
import { useEffect, useId, useState } from 'react';
export function BreedField({
  species,
  value,
  onChange,
  id,
  name,
}: {
  species: string;
  value: string;
  onChange: (value: string) => void;
  id?: string;
  name?: string;
}) {
  const listId = useId();
  const [choices, setChoices] = useState<
    Array<{ species: string; name: string; isActive: boolean }>
  >([]);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/patient-options/breeds', { signal: controller.signal })
      .then(async (response) => {
        if (response.ok)
          setChoices(((await response.json()) as { choices: typeof choices }).choices);
      })
      .catch(() => {
        /* Manual breed entry remains available. */
      });
    return () => controller.abort();
  }, []);
  return (
    <>
      <input
        id={id}
        name={name}
        list={listId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search breeds or enter a mix"
        maxLength={100}
        autoComplete="off"
      />
      <datalist id={listId}>
        {choices
          .filter(
            (item) =>
              item.isActive &&
              item.species.toLowerCase() ===
                (species.toLowerCase() === 'canine'
                  ? 'dog'
                  : species.toLowerCase() === 'feline'
                    ? 'cat'
                    : species.toLowerCase()),
          )
          .map((item) => (
            <option key={item.name} value={item.name} />
          ))}
      </datalist>
    </>
  );
}
