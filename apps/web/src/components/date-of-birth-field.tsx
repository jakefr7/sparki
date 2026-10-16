'use client';
import { useEffect, useState } from 'react';

import {
  estimateDateOfBirth,
  todayDateInputValue,
  type DateOfBirthMode,
  type DateOfBirthValue,
} from '../lib/date-of-birth';

/**
 * Date of birth entry shared by every patient form (SPA-40). An estimated age
 * fills in a date calculated from today, which staff can adjust; the saved
 * date stays marked as estimated so prescriptions get a real date without
 * the record losing that it is approximate.
 */
export function DateOfBirthField({
  idPrefix,
  value,
  onChange,
  legend = 'Age',
  legacyEstimate,
  error,
  disabled,
}: {
  idPrefix: string;
  value: DateOfBirthValue;
  onChange: (value: DateOfBirthValue) => void;
  legend?: string;
  /** Free-text estimate saved before estimated ages produced a date. */
  legacyEstimate?: string | null;
  error?: string | undefined;
  disabled?: boolean;
}) {
  const estimated = value.mode === 'estimated';
  const [timeZone, setTimeZone] = useState<string>();
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/patient-options', { signal: controller.signal })
      .then(async (response) => {
        if (response.ok) setTimeZone(((await response.json()) as { timeZone: string }).timeZone);
      })
      .catch(() => {
        /* The API validates against the clinic date on save. */
      });
    return () => controller.abort();
  }, []);
  const today = todayDateInputValue(new Date(), timeZone);

  function setMode(mode: DateOfBirthMode) {
    if (mode === value.mode) return;
    // Never carry a date across: an estimate must not become a known DOB.
    onChange({ mode, date: '', years: '', months: '' });
  }

  function setAge(part: 'years' | 'months', raw: string) {
    if (!(part === 'years' ? /^\d{0,2}(\.\d{0,2})?$/ : /^\d{0,2}$/).test(raw)) return;
    const next = { ...value, [part]: raw };
    onChange({
      ...next,
      date: estimateDateOfBirth(
        Number(next.years || 0),
        Number(next.months || 0),
        new Date(`${today}T12:00:00`),
      ),
    });
  }

  return (
    <fieldset className="dob-field" disabled={disabled}>
      <legend>{legend}</legend>
      <div className="dob-field__mode" role="radiogroup" aria-label="Date of birth entry">
        <label>
          <input
            type="radio"
            name={`${idPrefix}-dob-mode`}
            checked={!estimated}
            onChange={() => setMode('exact')}
          />
          <span>Known DOB</span>
        </label>
        <label>
          <input
            type="radio"
            name={`${idPrefix}-dob-mode`}
            checked={estimated}
            onChange={() => setMode('estimated')}
          />
          <span>Estimated age</span>
        </label>
      </div>
      <div className={`dob-field__inputs${estimated ? '' : ' dob-field__inputs--exact'}`}>
        {estimated ? (
          <>
            <label htmlFor={`${idPrefix}-age-years`}>
              Years
              <input
                id={`${idPrefix}-age-years`}
                inputMode="decimal"
                value={value.years}
                onChange={(event) => setAge('years', event.target.value)}
                placeholder="0"
                autoComplete="off"
              />
            </label>
            <label htmlFor={`${idPrefix}-age-months`}>
              Months
              <input
                id={`${idPrefix}-age-months`}
                inputMode="numeric"
                value={value.months}
                onChange={(event) => setAge('months', event.target.value)}
                placeholder="0"
                autoComplete="off"
              />
            </label>
          </>
        ) : null}
        <label htmlFor={`${idPrefix}-dob`} className="dob-field__date">
          {estimated ? 'Estimated date of birth' : 'Date of birth'}
          <input
            id={`${idPrefix}-dob`}
            type="date"
            max={today}
            value={value.date}
            // A hand-adjusted date replaces the age it came from but stays estimated.
            onChange={(event) =>
              onChange({ ...value, date: event.target.value, years: '', months: '' })
            }
            autoComplete="off"
          />
        </label>
      </div>
      {estimated ? (
        <p className="dob-field__hint">
          Calculated from today&apos;s date. Adjust it if needed; it is saved as an estimated date
          of birth.
        </p>
      ) : null}
      {legacyEstimate && !value.date ? (
        <p className="dob-field__hint">Previously recorded estimate: {legacyEstimate}</p>
      ) : null}
      {error ? (
        <small className="dob-field__error" role="alert">
          {error}
        </small>
      ) : null}
    </fieldset>
  );
}
