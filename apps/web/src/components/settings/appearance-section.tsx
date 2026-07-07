'use client';

import { useTheme } from '../theme-provider';
import type { Theme } from '../../lib/theme';

const THEME_OPTIONS: { value: Theme; label: string; hint: string }[] = [
  { value: 'light', label: 'Light', hint: 'Bright surfaces, dark text.' },
  { value: 'dark', label: 'Dark', hint: 'Dark surfaces, light text. Default.' },
];

export function AppearanceSection() {
  const { theme, setTheme } = useTheme();

  return (
    <section className="settings-section" aria-labelledby="settings-appearance-heading">
      <h1 id="settings-appearance-heading">Appearance</h1>
      <p className="settings-section__intro">Choose how Sparki looks on this device.</p>

      <fieldset className="settings-group">
        <legend>Theme</legend>
        <div className="settings-radio-group" role="radiogroup" aria-label="Theme">
          {THEME_OPTIONS.map((option) => (
            <label key={option.value} className="settings-radio">
              <input
                type="radio"
                name="theme"
                value={option.value}
                checked={theme === option.value}
                onChange={() => setTheme(option.value)}
              />
              <span className="settings-radio__label">
                {option.label}
                <span className="settings-radio__hint">{option.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    </section>
  );
}
