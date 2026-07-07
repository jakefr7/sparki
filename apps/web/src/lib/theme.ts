export type Theme = 'light' | 'dark';

export const THEMES: readonly Theme[] = ['light', 'dark'];

/** Existing users (and anyone before their first choice in Settings) keep
 *  the app's original look. */
export const DEFAULT_THEME: Theme = 'dark';

export const THEME_STORAGE_KEY = 'sparki:theme';

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as string[]).includes(value);
}
