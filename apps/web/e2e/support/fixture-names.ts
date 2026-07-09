/**
 * Curated, realistic name pools for e2e test fixtures. Visible patient/client
 * names must never look machine-generated (no "Playwright Patient 3pp4ig") —
 * these are deterministic pools tests pick from by a seed string.
 * fixtureId()-style randomness still provides uniqueness where needed, but
 * only in internal-only fields (phone, email), never in a visible name.
 */

export const CLIENT_NAME_POOL: { firstName: string; lastName: string }[] = [
  { firstName: 'Sarah', lastName: 'Thompson' },
  { firstName: 'Michael', lastName: 'Rivera' },
  { firstName: 'Emily', lastName: 'Brooks' },
  { firstName: 'David', lastName: 'Bennett' },
  { firstName: 'Laura', lastName: 'Carter' },
  { firstName: 'James', lastName: 'Nguyen' },
  { firstName: 'Anna', lastName: 'Reed' },
  { firstName: 'Daniel', lastName: 'Lee' },
  { firstName: 'Olivia', lastName: 'Harris' },
  { firstName: 'Chris', lastName: 'Martinez' },
];

export const PATIENT_NAME_POOL: string[] = [
  'Bella',
  'Max',
  'Luna',
  'Charlie',
  'Daisy',
  'Milo',
  'Sadie',
  'Cooper',
  'Willow',
  'Rocky',
];

function hashToIndex(seed: string, length: number): number {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % length;
}

/** Deterministically picks a realistic client name pair from a seed string
 *  (e.g. a per-file constant plus a per-test discriminator). */
export function pickClientName(seed: string): { firstName: string; lastName: string } {
  // Non-null: hashToIndex's modulo guarantees an index within bounds.
  return CLIENT_NAME_POOL[hashToIndex(seed, CLIENT_NAME_POOL.length)]!;
}

/** Deterministically picks a realistic pet name from a seed string. */
export function pickPatientName(seed: string): string {
  return PATIENT_NAME_POOL[hashToIndex(seed, PATIENT_NAME_POOL.length)]!;
}

/** Introduces one transposition typo (swaps two adjacent letters) so fuzzy
 *  search tests can verify typo tolerance against whatever name was picked,
 *  without depending on the name containing a fixed literal like "Patient". */
export function makeTypo(name: string): string {
  if (name.length < 3) return `${name}x`;
  const middle = Math.floor(name.length / 2);
  const chars = name.split('');
  const swapIndex = chars[middle] === chars[middle - 1] ? middle + 1 : middle;
  if (swapIndex >= chars.length) return `${name}x`;
  const left = chars[swapIndex - 1]!;
  const right = chars[swapIndex]!;
  chars[swapIndex - 1] = right;
  chars[swapIndex] = left;
  return chars.join('');
}
