import { describe, expect, it } from 'vitest';
import { crtLabel, respiratoryLabel } from './intake-vitals';

describe('vital observation display', () => {
  it('keeps observations separate from numeric units', () => {
    expect(respiratoryLabel(null, 'Pant')).toBe('Pant');
    expect(respiratoryLabel(24)).toBe('24 rpm');
    expect(crtLabel(null, 'UnableToAssess')).toBe('Unable to Assess');
    expect(crtLabel(null, 'NotAssessed')).toBe('Not Assessed');
    expect(crtLabel(null, 'OneToTwoSeconds')).toBe('1–2 seconds (Normal)');
    expect(crtLabel(1.5)).toBe('1.5 sec');
    expect(crtLabel(null)).toBeNull();
  });
});
