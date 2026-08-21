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

  it('keeps appointment creation restricted to scheduling operators', () => {
    const controller = new AppointmentsController({} as AppointmentsService);

    expect(() => controller.create(veterinarian, {} as never)).toThrow(ForbiddenException);
  });
});
