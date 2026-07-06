import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, prisma, type UserRole } from '@sparki/db';
import type { ListStaffQuery } from './dto/list-staff.schema';

/** Clinic staff excludes CLIENT — that role identifies patient owners, not
 *  people who can be assigned as a provider/technician. */
const STAFF_ROLES: UserRole[] = [
  'OWNER',
  'PRACTICE_MANAGER',
  'FRONT_DESK',
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
    color: user.staffProfile?.color ?? null,
  };
}
