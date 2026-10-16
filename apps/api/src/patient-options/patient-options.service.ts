import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { prisma, type Prisma } from '@sparki/db';
import { canManageAdminSettings, requireAdminSettingsManager } from '../auth/permissions';
import type { AuthenticatedUser } from '../auth/types';
import { DEFAULT_BREEDS } from './breed-defaults';

export type ProviderSelection = {
  referringProviderId?: string | undefined;
  additionalProviderIds?: string[] | undefined;
};

// Called inside the booking transaction, so invalid/cross-clinic contacts roll
// back booking too. Adding context never creates a task or sends a message.
export async function savePatientProviders(
  tx: Prisma.TransactionClient,
  organizationId: string,
  patientId: string,
  input: ProviderSelection,
) {
  const ids = [
    ...new Set(
      [input.referringProviderId, ...(input.additionalProviderIds ?? [])].filter(
        (id): id is string => Boolean(id),
      ),
    ),
  ];
  if (!ids.length) return;
  const count = await tx.referralContact.count({ where: { organizationId, id: { in: ids } } });
  if (count !== ids.length)
    throw new BadRequestException('Choose providers from this clinic’s directory.');
  if (input.referringProviderId)
    await tx.patientProvider.deleteMany({
      where: { organizationId, patientId, kind: 'REFERRING' },
    });
  await tx.patientProvider.createMany({
    data: ids.map((contactId) => ({
      organizationId,
      patientId,
      contactId,
      kind: contactId === input.referringProviderId ? 'REFERRING' : 'ADDITIONAL',
    })),
    skipDuplicates: true,
  });
}

@Injectable()
export class PatientOptionsService {
  async breeds(user: AuthenticatedUser) {
    const overrides = await prisma.breedChoice.findMany({
      where: { organizationId: user.organizationId },
    });
    const choices = new Map<
      string,
      { species: string; key: string; name: string; isActive: boolean }
    >();
    for (const [species, names] of Object.entries(DEFAULT_BREEDS))
      for (const name of names)
        choices.set(`${species}:${name.toLowerCase()}`, {
          species,
          key: name.toLowerCase(),
          name,
          isActive: true,
        });
    for (const item of overrides) choices.set(`${item.species}:${item.key}`, item);
    return {
      canManage: canManageAdminSettings(user),
      choices: [...choices.values()].sort((a, b) => a.name.localeCompare(b.name)),
    };
  }
  async saveBreed(
    user: AuthenticatedUser,
    input: { species: string; key?: string | undefined; name: string; isActive: boolean },
  ) {
    requireAdminSettingsManager(user);
    const key = input.key ?? input.name.toLowerCase();
    return prisma.breedChoice.upsert({
      where: {
        organizationId_species_key: {
          organizationId: user.organizationId,
          species: input.species,
          key,
        },
      },
      create: { organizationId: user.organizationId, ...input, key },
      update: { name: input.name, isActive: input.isActive },
    });
  }
  async contacts(user: AuthenticatedUser, query: string) {
    return prisma.referralContact.findMany({
      where: {
        organizationId: user.organizationId,
        ...(query
          ? {
              OR: [
                { hospitalName: { contains: query, mode: 'insensitive' as const } },
                { veterinarian: { contains: query, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      orderBy: [{ hospitalName: 'asc' }, { id: 'asc' }],
      take: 40,
    });
  }
  async saveContact(
    user: AuthenticatedUser,
    input: {
      id?: string | undefined;
      hospitalName: string;
      veterinarian?: string | undefined;
      email?: string | undefined;
      phone?: string | undefined;
      address?: string | undefined;
    },
  ) {
    const { id, ...raw } = input;
    const data = Object.fromEntries(
      Object.entries(raw).filter(([, value]) => value !== undefined),
    ) as {
      hospitalName: string;
      veterinarian?: string;
      email?: string;
      phone?: string;
      address?: string;
    };
    if (id) {
      const contact = await prisma.referralContact.findFirst({
        where: { id, organizationId: user.organizationId },
      });
      if (!contact) throw new NotFoundException('Hospital not found.');
      return prisma.referralContact.update({ where: { id }, data });
    }
    return prisma.referralContact.create({
      data: { ...data, organizationId: user.organizationId },
    });
  }
  async providers(user: AuthenticatedUser, patientId: string) {
    await this.patient(user, patientId);
    return prisma.patientProvider.findMany({
      where: { organizationId: user.organizationId, patientId },
      include: { contact: true },
      orderBy: { id: 'asc' },
    });
  }
  async replaceProviders(user: AuthenticatedUser, patientId: string, input: ProviderSelection) {
    await this.patient(user, patientId);
    await prisma.$transaction(async (tx) => {
      // Serialize concurrent edits through the patient row.
      await tx.patient.update({ where: { id: patientId }, data: { updatedAt: new Date() } });
      await tx.patientProvider.deleteMany({
        where: { organizationId: user.organizationId, patientId },
      });
      await savePatientProviders(tx, user.organizationId, patientId, input);
    });
    return this.providers(user, patientId);
  }
  async recordsRequest(
    user: AuthenticatedUser,
    patientId: string,
    input: { contactId: string; assigneeId: string; requestKey: string },
  ) {
    const patient = await this.patient(user, patientId);
    const contact = await prisma.referralContact.findFirst({
      where: {
        id: input.contactId,
        organizationId: user.organizationId,
        patients: { some: { patientId, organizationId: user.organizationId } },
      },
    });
    if (!contact) throw new BadRequestException('Choose a provider linked to this patient.');
    const assignee = await prisma.user.findFirst({
      where: {
        id: input.assigneeId,
        organizationId: user.organizationId,
        isActive: true,
        role: { not: 'CLIENT' },
        clinicLocationAccess: {
          some: {
            organizationId: user.organizationId,
            clinicLocationId: user.locationId,
            isActive: true,
          },
        },
      },
    });
    if (!assignee) throw new BadRequestException('Choose active staff at this location.');
    const clinic = await prisma.organization.findUniqueOrThrow({
      where: { id: user.organizationId },
    });
    const client = patient.clients[0]?.client;
    const requestKey = `${user.organizationId}:${user.locationId}:${patientId}:${input.requestKey}`;
    return prisma.task.upsert({
      where: { requestKey },
      update: {},
      create: {
        organizationId: user.organizationId,
        locationId: user.locationId,
        patientId,
        requestKey,
        title: `Request records: ${patient.name} — ${contact.hospitalName}`.slice(0, 300),
        assigneeId: assignee.id,
        assignee: assignee.displayName || `${assignee.firstName} ${assignee.lastName}`,
        assignedBy: user.name,
        createdById: user.id,
        emailTo: contact.email ?? '',
        emailSubject:
          `Medical records request: ${patient.name}${client ? ` ${client.lastName}` : ''}`.slice(
            0,
            300,
          ),
        emailBody: `Hello ${contact.veterinarian || contact.hospitalName},\n\nPlease provide the available medical records for ${patient.name}${client ? ` (client: ${client.firstName} ${client.lastName})` : ''}.\nSpecies: ${patient.species}${patient.breed ? `\nBreed: ${patient.breed}` : ''}${patient.dateOfBirth ? `\nDOB: ${patient.dateOfBirth.toISOString().slice(0, 10)}${patient.dateOfBirthEstimated ? ' (estimated)' : ''}` : ''}\n\nPlease reply to ${clinic.email || 'our clinic'} with the records or let us know how to arrange transfer.\n\nThank you,\n${clinic.name}${clinic.phone ? `\n${clinic.phone}` : ''}`,
      },
    });
  }
  private async patient(user: AuthenticatedUser, id: string) {
    const patient = await prisma.patient.findFirst({
      where: { id, organizationId: user.organizationId },
      include: { clients: { where: { isPrimary: true }, include: { client: true } } },
    });
    if (!patient) throw new NotFoundException('Patient not found.');
    return patient;
  }
}
