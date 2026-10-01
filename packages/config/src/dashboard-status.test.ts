import { describe, expect, it } from 'vitest';
import { allowedConfiguredTransitions, appointmentsWithoutActiveVisits, enabledStatuses, resolveConfiguredStatus, type ConfiguredDashboardStatus } from './dashboard-status';

function status(overrides: Partial<ConfiguredDashboardStatus> & Pick<ConfiguredDashboardStatus, 'status' | 'name'>): ConfiguredDashboardStatus {
  return { id: overrides.status, description: null, color: '#123456', sortOrder: 10, isEnabled: true, isInClinic: false, allowedTransitionKeys: [], ...overrides };
}

describe('configured dashboard status resolver', () => {
  it('uses renamed admin labels and configured colors without changing workflow state', () => {
    const configured = status({ status: 'CheckIn', name: 'Welcomed', color: '#AABBCC', isInClinic: true });
    expect(resolveConfiguredStatus([configured], 'appointment', 'Arrived')).toEqual(configured);
    expect(resolveConfiguredStatus([configured], 'visit', 'Waiting')).toEqual(configured);
  });

  it('resolves fine-grained visit states through the same stable configured keys', () => {
    const exam = status({ status: 'Exam', name: 'Doctor Consult' });
    expect(resolveConfiguredStatus([exam], 'visit', 'VeterinarianExamInProgress')).toBe(exam);
    expect(resolveConfiguredStatus([exam], 'visit', 'DiagnosticsPending')).toBe(exam);
  });

  it('filters disabled statuses and respects configured order', () => {
    const later = status({ status: 'Exam', name: 'Exam', sortOrder: 30 });
    const disabled = status({ status: 'CheckIn', name: 'Arrival', sortOrder: 5, isEnabled: false });
    const first = status({ status: 'Appointment', name: 'Booked', sortOrder: 10 });
    expect(enabledStatuses([later, disabled, first])).toEqual([first, later]);
  });

  it('uses fixed adjacent transitions and ignores stored custom shortcuts', () => {
    const intake = status({ status: 'BeginIntake', name: 'Triage', allowedTransitionKeys: ['CheckIn', 'Exam', 'Disabled'] });
    const back = status({ status: 'CheckIn', name: 'Welcomed' });
    const forward = status({ status: 'ReadyForVeterinarian', name: 'Ready' });
    const shortcut = status({ status: 'Exam', name: 'Consult' });
    const disabled = status({ status: 'Disabled', name: 'Hidden', isEnabled: false });
    expect(allowedConfiguredTransitions([intake, back, forward, shortcut, disabled], intake)).toEqual([back, forward]);
  });

  it('removes an appointment when its active visit represents the same patient flow', () => {
    const appointments = [{ id: 'linked' }, { id: 'standalone' }];
    const visits = [{ appointment: { id: 'linked' } }, { appointment: null }];
    expect(appointmentsWithoutActiveVisits(appointments, visits)).toEqual([{ id: 'standalone' }]);
  });

});
