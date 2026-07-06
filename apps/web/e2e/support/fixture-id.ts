/**
 * Short random alphanumeric tag for uniquely naming e2e test fixtures
 * (client/patient names, phone numbers, etc). Unlike `Date.now()`,
 * fixtures created moments apart don't share long common digit runs, so
 * they don't collide in the patient/client trigram fuzzy-match ranking —
 * and they don't clutter the dashboard with raw 13-digit timestamps.
 */
export function fixtureId(): string {
  return Math.random().toString(36).slice(2, 8);
}
