/** Renders a PascalCase/underscore enum value (e.g. from Prisma) as a readable label. */
export function enumLabel(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

/** Formats a clock time (e.g. "2:30 PM") from an ISO timestamp. */
export function timeLabel(value: string): string {
  return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** Formats a patient's age from its date of birth. `short` is for dense list rows. */
export function formatAge(
  dateOfBirth: string | null,
  style: 'long' | 'short' = 'long',
): string | null {
  if (!dateOfBirth) return null;
  const years = (Date.now() - new Date(dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000);

  if (style === 'short') {
    return years < 1 ? '<1 yr' : `${Math.floor(years)} yr`;
  }

  return years < 1 ? 'under 1 year old' : `${Math.floor(years)} years old`;
}
