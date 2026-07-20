import { describe, expect, it } from 'vitest';
import { schedulingIssueFor } from './appointments.service';

function appointment(overrides: Partial<Parameters<typeof schedulingIssueFor>[0]> = {}) {
  return {
    scheduledAt: new Date('2099-01-10T15:00:00.000Z'),
    state: 'Scheduled',
    providerId: 'provider-1',
    schedulerSlotTemplateId: null,
    appointmentTypeSetting: {
      isActive: true,
      providers: [{ providerId: 'provider-1' }],
      slotTemplates: [],
    },
    ...overrides,
  };
}

describe('schedulingIssueFor', () => {
  it('allows general appointment styles without a schedule block', () => {
    expect(schedulingIssueFor(appointment())).toBeNull();
  });

  it('flags a block-restricted style when no block is assigned', () => {
    expect(schedulingIssueFor(appointment({
      appointmentTypeSetting: {
        isActive: true,
        providers: [{ providerId: 'provider-1' }],
        slotTemplates: [{ slotTemplateId: 'surgery-block' }],
      },
    }))).toBe('This appointment style requires an assigned schedule block');
  });

  it('accepts an eligible assigned block', () => {
    expect(schedulingIssueFor(appointment({
      schedulerSlotTemplateId: 'surgery-block',
      appointmentTypeSetting: {
        isActive: true,
        providers: [{ providerId: 'provider-1' }],
        slotTemplates: [{ slotTemplateId: 'surgery-block' }],
      },
    }))).toBeNull();
  });

  it('flags an assigned block that does not allow the style', () => {
    expect(schedulingIssueFor(appointment({
      schedulerSlotTemplateId: 'dental-block',
      appointmentTypeSetting: {
        isActive: true,
        providers: [{ providerId: 'provider-1' }],
        slotTemplates: [{ slotTemplateId: 'surgery-block' }],
      },
    }))).toBe('Appointment is assigned to a block that does not allow this style');
  });
});
