import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../auth/types';
import { AppointmentsController } from './appointments.controller';
import type { AppointmentsService } from './appointments.service';

const veterinarian: AuthenticatedUser = {
  id: 'vet-1',
  email: 'vet@example.com',
  name: 'Dr. Rivera',
  organizationId: 'org-1',
  locationId: 'location-1',
  role: 'VETERINARIAN',
  subscriptionStatus: 'ACTIVE',
  canManageAdminSettings: false,
  canFinalizeRecordsForOthers: false,
};

describe('AppointmentsController patient-flow authorization', () => {
  it('lets a veterinarian check in an appointment from the Today patient flow', async () => {
    const markArrived = vi.fn().mockResolvedValue({ id: 'appointment-1', state: 'Arrived' });
    const controller = new AppointmentsController({ markArrived } as unknown as AppointmentsService);

    await expect(controller.markArrived(veterinarian, 'appointment-1')).resolves.toMatchObject({
      state: 'Arrived',
    });
    expect(markArrived).toHaveBeenCalledWith(
      'appointment-1',
      veterinarian.organizationId,
      veterinarian.locationId,
      veterinarian.id,
    );
  });

  it.each(['TECHNICIAN', 'ASSISTANT'] as const)('keeps appointment creation restricted for %s', (role) => {
    const controller = new AppointmentsController({} as AppointmentsService);

    expect(() => controller.create({ ...veterinarian, role }, {} as never)).toThrow(ForbiddenException);
  });

  const actions = [
    ['create', (controller: AppointmentsController, user: AuthenticatedUser) => controller.create(user, {} as never)],
    ['createWithNewPatient', (controller: AppointmentsController, user: AuthenticatedUser) => controller.createWithNewPatient(user, {} as never)],
    ['move', (controller: AppointmentsController, user: AuthenticatedUser) => controller.move(user, 'appointment-1', {} as never)],
    ['confirm', (controller: AppointmentsController, user: AuthenticatedUser) => controller.confirm(user, 'appointment-1')],
    ['updateConfirmationStatus', (controller: AppointmentsController, user: AuthenticatedUser) => controller.updateConfirmationStatus(user, 'appointment-1', { confirmationStatus: 'Confirmed' })],
    ['cancel', (controller: AppointmentsController, user: AuthenticatedUser) => controller.cancel(user, 'appointment-1', { reason: 'Client request' })],
  ] as const;

  it.each(actions)('lets veterinarians perform %s using their own identity and clinic scope', async (method, invoke) => {
    const action = vi.fn().mockResolvedValue({ id: 'appointment-1' });
    const controller = new AppointmentsController({ [method]: action } as unknown as AppointmentsService);
    await expect(invoke(controller, veterinarian)).resolves.toEqual({ id: 'appointment-1' });
    expect(action).toHaveBeenCalledOnce();
    expect(action.mock.calls[0]).toContain(veterinarian.organizationId);
    expect(action.mock.calls[0]).toContain(veterinarian.locationId);
    if (method !== 'updateConfirmationStatus') {
      expect(action.mock.calls[0]).toContain(veterinarian.id);
    }
  });

  it.each(actions)('keeps %s unavailable to technicians and assistants', (_method, invoke) => {
    const controller = new AppointmentsController({} as AppointmentsService);
    for (const role of ['TECHNICIAN', 'ASSISTANT'] as const) {
      expect(() => invoke(controller, { ...veterinarian, role })).toThrow(ForbiddenException);
    }
  });

  it('retains existing veterinarian restrictions on unrelated scheduling actions', () => {
    const controller = new AppointmentsController({} as AppointmentsService);
    expect(() => controller.markNoShow(veterinarian, 'appointment-1')).toThrow(ForbiddenException);
    expect(() => controller.linkPatient(veterinarian, 'appointment-1', { patientId: 'patient-1' })).toThrow(ForbiddenException);
  });
});
