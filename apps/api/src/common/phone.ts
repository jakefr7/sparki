/**
 * Normalizes a staff-entered phone number to E.164, or returns null when it
 * is not a complete US/Canada number.
 *
 * Deliberately strict rather than clever: digits only, an optional leading
 * 1, and a valid North American area code and exchange. Extensions, short
 * numbers, and other countries return null — a number Sparki cannot be sure
 * of is treated as "not textable" rather than guessed at. The backfill in
 * the client_communication_core migration implements the same rule in SQL;
 * keep the two in step.
 */
export function normalizeUsPhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const digits = input.replace(/[^0-9]/g, '');
  const national =
    digits.length === 11 && digits.startsWith('1')
      ? digits.slice(1)
      : digits.length === 10
        ? digits
        : null;
  if (!national || !/^[2-9][0-9]{2}[2-9][0-9]{6}$/.test(national)) return null;
  return `+1${national}`;
}

/** "+13125550142" -> "(312) 555-0142". Anything else is returned unchanged. */
export function formatUsPhone(e164: string): string {
  const match = /^\+1([0-9]{3})([0-9]{3})([0-9]{4})$/.exec(e164);
  return match ? `(${match[1]}) ${match[2]}-${match[3]}` : e164;
}
