import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { prisma, type UserRole } from '@sparki/db';
import { AttachmentStorageService } from '../messaging/attachment-storage.service';
import type { RemoveClinicalAttachmentInput, UploadClinicalAttachmentInput } from './dto/clinical-attachment.schema';

export const MAX_CLINICAL_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const CLINICAL_ATTACHMENT_ROLES: UserRole[] = ['OWNER', 'PRACTICE_MANAGER', 'VETERINARIAN', 'TECHNICIAN', 'ASSISTANT', 'RECEPTIONIST'];

@Injectable()
export class ClinicalAttachmentsService {
  constructor(private readonly storage: AttachmentStorageService) {}

  async upload(user: { id: string; role: UserRole; organizationId: string; locationId: string }, input: UploadClinicalAttachmentInput) {
    if (!CLINICAL_ATTACHMENT_ROLES.includes(user.role)) throw new ForbiddenException('Clinical attachment access is not available for this role.');
    let patientId = input.patientId ?? null;
    if (input.visitId) {
      const visit = await prisma.visit.findFirst({ where: { id: input.visitId, organizationId: user.organizationId, locationId: user.locationId }, select: { patientId: true } });
      if (!visit) throw new NotFoundException('Visit not found.');
      if (patientId && patientId !== visit.patientId) throw new BadRequestException('The patient and visit association do not match.');
      patientId = visit.patientId;
    } else if (patientId) {
      const patient = await prisma.patient.findFirst({ where: { id: patientId, organizationId: user.organizationId }, select: { id: true } });
      if (!patient) throw new NotFoundException('Patient not found.');
    }
    const body = Buffer.from(input.contentBase64, 'base64');
    if (!body.length || body.toString('base64').replace(/=+$/, '') !== input.contentBase64.replace(/=+$/, '')) throw new BadRequestException('Attachment content is not valid base64.');
    if (body.length > MAX_CLINICAL_ATTACHMENT_BYTES) throw new BadRequestException('Attachment exceeds the 25 MB limit.');
    if (!matchesDeclaredType(body, input.mimeType)) throw new BadRequestException('Attachment content does not match its PDF, JPG, or PNG type.');
    const key = this.storage.clinicalKey(user.organizationId, user.locationId);
    await this.storage.put(key, body, input.mimeType, input.fileName);
    try {
      return await prisma.$transaction(async (tx) => {
        const replaced = input.replacesAttachmentId ? await tx.clinicalAttachment.findFirst({ where: { id: input.replacesAttachmentId, organizationId: user.organizationId, locationId: user.locationId, removedAt: null } }) : null;
        if (input.replacesAttachmentId && !replaced) throw new NotFoundException('Attachment to replace was not found.');
        if (replaced && (replaced.patientId !== patientId || replaced.visitId !== (input.visitId ?? null))) throw new BadRequestException('A correction must retain the original patient and visit association.');
        const attachment = await tx.clinicalAttachment.create({ data: { organizationId: user.organizationId, locationId: user.locationId, patientId, visitId: input.visitId ?? null, fileName: input.fileName, mimeType: input.mimeType, sizeBytes: body.length, storageKey: key, label: input.label || null, uploadedById: user.id } });
        await tx.clinicalAttachmentEvent.create({ data: { organizationId: user.organizationId, attachmentId: attachment.id, actorId: user.id, action: replaced ? 'CORRECTION_UPLOADED' : 'UPLOADED', reason: input.correctionReason ?? null } });
        if (replaced) {
          await tx.clinicalAttachment.update({ where: { id: replaced.id }, data: { removedAt: new Date(), supersededById: attachment.id } });
          await tx.clinicalAttachmentEvent.create({ data: { organizationId: user.organizationId, attachmentId: replaced.id, actorId: user.id, action: 'SUPERSEDED', reason: input.correctionReason ?? null, metadata: { replacementAttachmentId: attachment.id } } });
        }
        return this.publicView(attachment);
      });
    } catch (error) { await this.storage.remove(key); throw error; }
  }

  async download(user: { organizationId: string; locationId: string }, id: string) {
    const attachment = await prisma.clinicalAttachment.findFirst({ where: { id, organizationId: user.organizationId, locationId: user.locationId, removedAt: null } });
    if (!attachment || !this.storage.clinicalBelongsTo(attachment.storageKey, user.organizationId, user.locationId)) throw new NotFoundException('Attachment not found.');
    return { ...(await this.storage.get(attachment.storageKey)), fileName: attachment.fileName, contentType: attachment.mimeType };
  }

  async remove(user: { id: string; role: UserRole; organizationId: string; locationId: string }, id: string, input: RemoveClinicalAttachmentInput) {
    if (!['OWNER', 'PRACTICE_MANAGER', 'VETERINARIAN'].includes(user.role)) throw new ForbiddenException('Only a veterinarian or manager can remove a clinical attachment.');
    const attachment = await prisma.clinicalAttachment.findFirst({ where: { id, organizationId: user.organizationId, locationId: user.locationId, removedAt: null }, include: { visit: { include: { soapNotes: { where: { status: 'Locked' }, take: 1 } } } } });
    if (!attachment) throw new NotFoundException('Attachment not found.');
    const action = attachment.visit?.soapNotes.length ? 'REMOVED_FROM_FINALIZED_HISTORY' : 'REMOVED';
    await prisma.$transaction([
      prisma.clinicalAttachment.update({ where: { id }, data: { removedAt: new Date() } }),
      prisma.clinicalAttachmentEvent.create({ data: { organizationId: user.organizationId, attachmentId: id, actorId: user.id, action, reason: input.reason } }),
    ]);
    return { id, removed: true, retainedForAudit: true };
  }

  private publicView(attachment: { id: string; patientId: string | null; visitId: string | null; fileName: string; mimeType: string; sizeBytes: number; label: string | null; createdAt: Date }) {
    return { ...attachment, href: `/clinical-attachments/${attachment.id}/content` };
  }
}

function matchesDeclaredType(body: Buffer, mimeType: string) {
  if (mimeType === 'application/pdf') return body.subarray(0, 5).toString('ascii') === '%PDF-';
  if (mimeType === 'image/jpeg') return body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff;
  return body.length >= 8 && body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
}
