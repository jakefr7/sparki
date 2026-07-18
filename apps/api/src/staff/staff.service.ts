import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, prisma, type UserRole } from '@sparki/db';
import type { ListStaffQuery } from './dto/list-staff.schema';
import type { AuthenticatedUser } from '../auth/types';
import { ConflictException } from '@nestjs/common';

/** Clinic staff excludes CLIENT — that role identifies patient owners, not
 *  people who can be assigned as a provider/technician. */
const STAFF_ROLES: UserRole[] = [
  'OWNER',
  'PRACTICE_MANAGER',
  'RECEPTIONIST',
  'VETERINARIAN',
  'TECHNICIAN',
  'ASSISTANT',
];

const staffWithProfile = Prisma.validator<Prisma.UserDefaultArgs>()({
  include: { staffProfile: true },
});

type StaffWithProfile = Prisma.UserGetPayload<typeof staffWithProfile>;

@Injectable()
export class StaffService {
  async list(organizationId: string, query: ListStaffQuery) {
    const roles = query.role
      ? query.role.filter((role) => STAFF_ROLES.includes(role))
      : STAFF_ROLES;

    const staff = await prisma.user.findMany({
      where: {
        organizationId,
        isActive: true,
        role: { in: roles },
        ...(query.canReceiveAppointments !== undefined
          ? { staffProfile: { canReceiveAppointments: query.canReceiveAppointments } }
          : {}),
        ...(query.canOwnVisits !== undefined
          ? { staffProfile: { canOwnVisits: query.canOwnVisits } }
          : {}),
      },
      ...staffWithProfile,
      orderBy: [{ role: 'asc' }, { firstName: 'asc' }],
    });

    return staff.map(toStaffSummary);
  }

  async findById(id: string, organizationId: string) {
    const staff = await prisma.user.findFirst({
      where: { id, organizationId, role: { in: STAFF_ROLES } },
      ...staffWithProfile,
    });
    if (!staff) {
      throw new NotFoundException(`Staff member ${id} not found`);
    }
    return toStaffSummary(staff);
  }

  async updateRecordSignoffPermission(id: string, actor: AuthenticatedUser, allowed: boolean) {
    const existing = await prisma.user.findFirst({
      where: { id, organizationId: actor.organizationId, isActive: true, role: { in: ['VETERINARIAN', 'OWNER'] } },
    });
    if (!existing) throw new ConflictException('Only an active veterinarian or clinical owner may receive record signoff permission.');
    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: { canFinalizeRecordsForOthers: allowed },
      ...staffWithProfile,
    });
    await prisma.schedulerConfigChange.create({
      data: {
        organizationId: actor.organizationId,
        locationId: actor.locationId,
        actorId: actor.id,
        entityType: 'RecordSignoffPermission',
        entityId: existing.id,
        action: allowed ? 'Granted' : 'Revoked',
        before: { canFinalizeRecordsForOthers: existing.canFinalizeRecordsForOthers },
        after: { canFinalizeRecordsForOthers: allowed },
      },
    });
    return toStaffSummary(updated);
  }
}

function toStaffSummary(user: StaffWithProfile) {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    displayName: user.displayName ?? `${user.firstName} ${user.lastName}`,
    role: user.role,
    jobTitle: user.staffProfile?.jobTitle ?? null,
    licenseNumber: user.staffProfile?.licenseNumber ?? null,
    canReceiveAppointments: user.staffProfile?.canReceiveAppointments ?? false,
    canOwnVisits: user.staffProfile?.canOwnVisits ?? false,
    canFinalizeRecordsForOthers: user.canFinalizeRecordsForOthers,
    color: user.staffProfile?.color ?? null,
  };
}
