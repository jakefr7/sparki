// Dates of birth are calendar dates. The API stores them at midnight UTC, so
// every read here uses UTC; local time would show the previous day in the
// Americas.

import { formatAge } from './format';

export type DateOfBirthMode = 'exact' | 'estimated';

export interface DateOfBirthValue {
  mode: DateOfBirthMode;
  /** YYYY-MM-DD, or '' when not entered. */
  date: string;
  /** Age entry that produced an estimated date; never saved on its own. */
  years: string;
  months: string;
}

const pad = (value: number) => String(value).padStart(2, '0');

/** Today's date for the person entering it, as YYYY-MM-DD. */
export function todayDateInputValue(today = new Date(), timeZone?: string): string {
  if (timeZone) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(today);
    const part = (type: string) => parts.find((value) => value.type === type)!.value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  }
  return `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
}

/**
 * Subtracts an age from today on the calendar (5 years before Oct 16 is
 * Oct 16), clamping to the month's last day. Returns '' for no age.
 */
export function estimateDateOfBirth(years: number, months: number, today = new Date()): string {
  const totalMonths = Math.round(years * 12) + Math.trunc(months);
  if (!Number.isFinite(totalMonths) || totalMonths <= 0) return '';
  const monthIndex = today.getFullYear() * 12 + today.getMonth() - totalMonths;
  const year = Math.floor(monthIndex / 12);
  const month = monthIndex - year * 12;
  const lastDay = new Date(year, month + 1, 0).getDate();
  return `${year}-${pad(month + 1)}-${pad(Math.min(today.getDate(), lastDay))}`;
}

export function dateOfBirthInputValue(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

export function initialDateOfBirthValue(
  dateOfBirth: string | null | undefined,
  estimated: boolean | null | undefined,
  defaultMode: DateOfBirthMode = 'exact',
): DateOfBirthValue {
  const date = dateOfBirthInputValue(dateOfBirth);
  return {
    mode: date ? (estimated ? 'estimated' : 'exact') : defaultMode,
    date,
    years: '',
    months: '',
  };
}

export function dateOfBirthPayload(value: DateOfBirthValue): {
  dateOfBirth: string | null;
  dateOfBirthEstimated: boolean;
} {
  return value.date
    ? { dateOfBirth: value.date, dateOfBirthEstimated: value.mode === 'estimated' }
    : { dateOfBirth: null, dateOfBirthEstimated: false };
}

/** Short age for patient headers; marks an age that comes from an estimate. */
export function patientAgeLabel(patient: {
  dateOfBirth: string | null;
  dateOfBirthEstimated?: boolean | undefined;
  estimatedAge: string | null;
}): string | null {
  const age = formatAge(patient.dateOfBirth);
  if (!age) return patient.estimatedAge;
  return patient.dateOfBirthEstimated && !age.startsWith('under') ? `About ${age}` : age;
}

/** Long display date, e.g. "March 4, 2021". */
export function formatDateOfBirth(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
