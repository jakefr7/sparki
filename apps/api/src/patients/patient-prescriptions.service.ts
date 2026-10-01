import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@sparki/db';
import { z } from 'zod';
import type { AuthenticatedUser } from '../auth/types';
import { renderPatientDocument } from '../visits/patient-document-renderer';

export const prescriptionDraftSchema = z.object({
  catalogItemId: z.string().optional(), medicationName: z.string().trim().min(1).max(200),
  strength: z.string().trim().min(1).max(100), form: z.string().trim().max(100).optional(),
  directions: z.string().trim().min(1).max(10000), quantity: z.string().regex(/^\d+(\.\d{1,8})?$/).refine((value) => Number(value) > 0 && Number(value) <= 1000000),
  quantityUnit: z.string().trim().min(1).max(50), allowedRefills: z.number().int().min(0).max(99),
  expiresAt: z.coerce.date(),
});
export const prescriptionActionSchema = z.object({ version: z.number().int().positive(), reason: z.string().trim().min(3).max(1000).optional() });

@Injectable()
export class PatientPrescriptionsService {
  private assertPrepare(user: AuthenticatedUser) {
    if (!(user.canManageMedications || ['OWNER', 'VETERINARIAN', 'TECHNICIAN'].includes(user.role))) throw new ForbiddenException('Medication-clerk or clinical medication permission is required.');
  }
  private async patient(user: AuthenticatedUser, id: string) {
    const patient = await prisma.patient.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!patient) throw new NotFoundException('Patient not found.');
    return patient;
  }
  async list(user: AuthenticatedUser, patientId: string) {
    this.assertPrepare(user); await this.patient(user, patientId);
    return { canAuthorize: ['OWNER', 'VETERINARIAN'].includes(user.role), catalog: await prisma.catalogItem.findMany({ where: { organizationId: user.organizationId, primaryType: 'MEDICATION', status: 'ACTIVE', OR: [{ locationId: null }, { locationId: user.locationId }] }, select: { id: true, name: true, strength: true, form: true }, orderBy: { name: 'asc' } }), prescriptions: await prisma.patientPrescription.findMany({ where: { patientId, organizationId: user.organizationId, locationId: user.locationId }, orderBy: { createdAt: 'desc' } }) };
  }
  async create(user: AuthenticatedUser, patientId: string, input: z.infer<typeof prescriptionDraftSchema>) {
    this.assertPrepare(user); await this.patient(user, patientId);
    if (input.expiresAt <= new Date()) throw new BadRequestException('Choose a future expiration date.');
    if (input.catalogItemId) {
      const item = await prisma.catalogItem.findFirst({ where: { id: input.catalogItemId, organizationId: user.organizationId, primaryType: 'MEDICATION', status: 'ACTIVE', OR: [{ locationId: null }, { locationId: user.locationId }] } });
      if (!item) throw new BadRequestException('Select an active hospital medication.');
    }
    return prisma.patientPrescription.create({ data: { ...input, catalogItemId: input.catalogItemId ?? null, form: input.form ?? null, organizationId: user.organizationId, locationId: user.locationId, patientId, preparedById: user.id, events: { create: { organizationId: user.organizationId, actorId: user.id, action: 'PREPARED' } } } });
  }
  async action(user: AuthenticatedUser, patientId: string, id: string, action: 'authorize' | 'cancel', input: z.infer<typeof prescriptionActionSchema>) {
    if (!['OWNER', 'VETERINARIAN'].includes(user.role)) throw new ForbiddenException('Only a veterinarian or practice owner can authorize or cancel prescriptions.');
    const prescription = await prisma.patientPrescription.findFirst({ where: { id, patientId, organizationId: user.organizationId, locationId: user.locationId } });
    if (!prescription) throw new NotFoundException('Prescription not found.');
    if (action === 'authorize' && prescription.status !== 'DRAFT') throw new ConflictException('Only draft prescriptions can be authorized.');
    if (action === 'cancel' && prescription.status === 'CANCELLED') throw new ConflictException('This prescription is already cancelled.');
    if (action === 'cancel' && !input.reason) throw new BadRequestException('Provide a cancellation reason.');
    if (action === 'authorize' && prescription.expiresAt <= new Date()) throw new ConflictException('This prescription has expired. Prepare a new draft.');
    const signer = await prisma.user.findFirst({ where: { id: user.id, organizationId: user.organizationId, isActive: true }, include: { staffProfile: true } });
    if (!signer) throw new ForbiddenException('An active prescribing identity is required.');
    return prisma.$transaction(async (tx) => {
      const changed = await tx.patientPrescription.updateMany({ where: { id, organizationId: user.organizationId, locationId: user.locationId, version: input.version, status: prescription.status }, data: action === 'authorize' ? { status: 'AUTHORIZED', version: { increment: 1 }, authorizedById: user.id, authorizedByName: signer.displayName || `${signer.firstName} ${signer.lastName}`, licenseNumber: signer.staffProfile?.licenseNumber ?? null, authorizedAt: new Date() } : { status: 'CANCELLED', version: { increment: 1 }, cancelledAt: new Date(), cancellationReason: input.reason! } });
      if (changed.count !== 1) throw new ConflictException('This prescription changed elsewhere. Reload before continuing.');
      await tx.patientPrescriptionEvent.create({ data: { prescriptionId: id, organizationId: user.organizationId, actorId: user.id, action: action === 'authorize' ? 'AUTHORIZED' : 'CANCELLED', metadata: { reason: input.reason ?? null, previousVersion: input.version } } });
      return tx.patientPrescription.findUniqueOrThrow({ where: { id } });
    });
  }
  async pdf(user: AuthenticatedUser, patientId: string, id: string) {
    this.assertPrepare(user); const patient = await this.patient(user, patientId);
    const prescription = await prisma.patientPrescription.findFirst({ where: { id, patientId, organizationId: user.organizationId, locationId: user.locationId } });
    if (!prescription) throw new NotFoundException('Prescription not found.');
    if (prescription.status !== 'AUTHORIZED' || prescription.expiresAt <= new Date()) throw new ConflictException('Only an authorized, unexpired prescription can be downloaded.');
    const [clinic, location, primaryClient] = await Promise.all([prisma.organization.findUniqueOrThrow({ where: { id: user.organizationId } }), prisma.location.findUniqueOrThrow({ where: { id: user.locationId } }), prisma.patientClient.findFirst({ where: { patientId, isPrimary: true, client: { organizationId: user.organizationId } }, include: { client: true } })]);
    const date = (value: Date) => value.toLocaleDateString('en-US', { timeZone: location.timeZone });
    return renderPatientDocument({ title: 'Prescription', clinic: clinic.name, contact: [clinic.phone, clinic.email, clinic.addressLine1, clinic.city, clinic.state, clinic.postalCode].filter(Boolean).join(' | '), patient: patient.name, identifiers: `${patient.species}${primaryClient ? ` | Client: ${primaryClient.client.firstName} ${primaryClient.client.lastName}` : ''} | Patient ID: ${patient.id} | Prescription ID: ${prescription.id}`, generatedAt: new Date().toLocaleString('en-US', { timeZone: location.timeZone }), sections: [
      { title: 'Medication', text: [prescription.medicationName, prescription.strength, prescription.form].filter(Boolean).join(' | ') },
      { title: 'Directions', text: prescription.directions },
      { title: 'Supply', text: `Quantity: ${prescription.quantity} ${prescription.quantityUnit}\nAllowed refills: ${prescription.allowedRefills}\nExpires: ${date(prescription.expiresAt)}` },
      { title: 'Prescriber authorization', text: `${prescription.authorizedByName}\nLicense: ${prescription.licenseNumber || 'Not recorded'}\nAuthorized: ${prescription.authorizedAt ? date(prescription.authorizedAt) : 'Not recorded'}\nSignature: ______________________________` },
    ] });
  }
}
