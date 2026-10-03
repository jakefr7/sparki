import { describe, expect, it } from 'vitest';
import { formatUsPhone, normalizeUsPhone } from './phone';

describe('normalizeUsPhone', () => {
  it.each([
    ['(312) 555-0142', '+13125550142'],
    ['312.555.0142', '+13125550142'],
    ['1-312-555-0142', '+13125550142'],
    ['+1 312 555 0142', '+13125550142'],
    ['3125550142', '+13125550142'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeUsPhone(input)).toBe(expected);
  });

  it.each([
    ['555-0142', 'no area code'],
    ['(312) 555-0142 ext 5', 'extension changes the digit count'],
    ['(012) 555-0142', 'area code cannot start with 0'],
    ['(312) 155-0142', 'exchange cannot start with 1'],
    ['+44 20 7946 0958', 'not a North American number'],
    ['call the neighbour', 'no digits'],
    ['', 'empty'],
  ])('returns null for %s (%s)', (input) => {
    expect(normalizeUsPhone(input)).toBeNull();
  });

  it('returns null for missing values', () => {
    expect(normalizeUsPhone(null)).toBeNull();
    expect(normalizeUsPhone(undefined)).toBeNull();
  });
});

describe('formatUsPhone', () => {
  it('formats a normalized number for display', () => {
    expect(formatUsPhone('+13125550142')).toBe('(312) 555-0142');
  });

  it('leaves anything else unchanged', () => {
    expect(formatUsPhone('+442079460958')).toBe('+442079460958');
  });
});
