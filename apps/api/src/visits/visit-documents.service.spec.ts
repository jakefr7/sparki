import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { prisma } from '@sparki/db';
import { VisitDocumentsService, readableExam } from './visit-documents.service';
import type { AuthenticatedUser } from '../auth/types';
import type { VisitBillingService } from './visit-billing.service';
import { renderPatientDocument } from './patient-document-renderer';

vi.mock('@sparki/db', () => ({ prisma: { visit: { findFirst: vi.fn() } } }));
vi.mock('./patient-document-renderer', () => ({ renderPatientDocument: vi.fn().mockResolvedValue(Buffer.from('%PDF-test')) }));
const user = { id: 'actor', role: 'VETERINARIAN', organizationId: 'org', locationId: 'location' } as AuthenticatedUser;
const visit = { id: 'visit', createdAt: new Date('2026-09-30T15:00:00Z'), organization: { name: 'Test clinic' }, location: { timeZone: 'America/Chicago' }, patient: { name: 'Sample pet', species: 'Canine', breed: null }, client: null, appointment: null, discharge: null, soapNotes: [] };
const billing = { getReceipt: vi.fn() };
const service = new VisitDocumentsService(billing as unknown as VisitBillingService);

beforeEach(() => { vi.clearAllMocks(); vi.mocked(prisma.visit.findFirst).mockResolvedValue(visit as never); });
describe('visit document access and readiness', () => {
  it('looks up only the authenticated organization and location', async () => {
    vi.mocked(prisma.visit.findFirst).mockResolvedValue(null);
    await expect(service.generate(user, 'foreign-visit', 'record')).rejects.toThrow(NotFoundException);
    expect(prisma.visit.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'foreign-visit', organizationId: 'org', locationId: 'location' } }));
    expect(renderPatientDocument).not.toHaveBeenCalled();
  });
  it('does not export unsigned SOAP as a final record', async () => {
    await expect(service.generate(user, 'visit', 'record')).rejects.toThrow(ConflictException);
    expect(renderPatientDocument).not.toHaveBeenCalled();
  });
  it('requires saved discharge instructions and uses their reviewed directions', async () => {
    await expect(service.generate(user, 'visit', 'discharge')).rejects.toThrow(ConflictException);
    vi.mocked(prisma.visit.findFirst).mockResolvedValue({ ...visit, discharge: { instructions: 'Reviewed home care', medicationInstructions: 'Reviewed directions', warningSigns: null, followUpPlan: 'Schedule a recheck' } } as never);
    await service.generate(user, 'visit', 'discharge');
    expect(renderPatientDocument).toHaveBeenCalledWith(expect.objectContaining({ sections: expect.arrayContaining([{ title: 'Medication directions', text: 'Reviewed directions' }]) }));
  });
  it('preserves original SOAP and shows attributed amendments', async () => {
    const author = { displayName: 'Dr. Test', firstName: 'Test', lastName: 'Doctor' };
    vi.mocked(prisma.visit.findFirst).mockResolvedValue({ ...visit, soapNotes: [
      { id: 'original', status: 'Locked', author, veterinarian: author, lockedAt: visit.createdAt, subjective: 'Original history', objective: 'Original findings', assessment: 'Original assessment', plan: 'Original plan' },
      { id: 'amendment', status: 'Amended', author, amendsSoapNoteId: 'original', createdAt: visit.createdAt, amendmentReason: 'Corrected history', subjective: 'Corrected history' },
    ] } as never);
    await service.generate(user, 'visit', 'record');
    const document = vi.mocked(renderPatientDocument).mock.calls[0]![0];
    expect(document.sections).toContainEqual({ title: 'Subjective', text: 'Original history' });
    expect(document.sections.find((section) => section.title === 'Amendment')?.text).toContain('Author: Dr. Test');
    expect(document.sections.find((section) => section.title === 'Amendment')?.text).toContain('Amends: original');
  });
  it('preserves billing access rules for receipt downloads', async () => {
    await expect(service.generate(user, 'visit', 'receipt')).rejects.toThrow(ForbiddenException);
    expect(billing.getReceipt).not.toHaveBeenCalled();
  });
  it('does not invent normal findings for undocumented exam systems', () => {
    expect(readableExam(JSON.stringify({ kind: 'sparki-small-animal-exam', systems: { eyes: { documented: true, status: 'Abnormal', notes: 'Recorded finding' }, ears: { documented: false, status: 'Normal' } } }))).toBe('Eyes: Abnormal - Recorded finding');
  });
});
