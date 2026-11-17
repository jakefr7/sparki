import { describe, expect, it, vi } from 'vitest';
import { VisitRecordsService } from './visit-records.service';
import type { Prisma } from '@sparki/db';

function fixture(existing: unknown = null) {
  const tx = {
    visit: { findFirst: vi.fn().mockResolvedValue({ id: 'visit', patientId: 'patient', medicalRecordId: 'record', primaryVeterinarianId: 'doctor', examFindings: { subjective: null, objective: JSON.stringify({ kind: 'sparki-small-animal-exam', systems: { eyes: { status: 'Normal', documented: true }, ears: { status: 'Normal', documented: false } } }), assessment: 'Assessment', plan: 'Internal plan' }, intake: { chiefComplaint: 'Concern', historyNotes: 'History', weight: 0, weightUnit: 'KG', temperature: 101, heartRate: 90, respiratoryRate: 20, crtSeconds: 1, gumColor: 'Pink', painScore: 0, painScale: 'Recorded scale' } }), update: vi.fn() },
    medicalRecord: { upsert: vi.fn().mockResolvedValue({ id: 'record' }) },
    soapNote: { updateMany: vi.fn().mockResolvedValue({ count: 1 }), findFirst: vi.fn().mockResolvedValue(existing), create: vi.fn().mockImplementation(({ data }) => data) },
  };
  return tx;
}
describe('SPA-7 new SOAP draft context', () => {
  it('carries attributed intake history/vitals into a new draft without inventing normal findings', async () => {
    const tx = fixture();
    await new VisitRecordsService().ensureDraftForVisitTx(tx as unknown as Prisma.TransactionClient, 'visit', 'org', 'location', 'author');
    const draft = tx.soapNote.create.mock.calls[0]![0].data;
    expect(draft.subjective).toContain('Intake history: History');
    expect(draft.objective).toContain('Intake vitals (staff recorded)');
    expect(draft.objective).toContain('Weight: 0 kg');
    expect(draft.objective).toContain('Pain score: 0');
    expect(draft.objective).toContain('Eyes: Normal');
    expect(draft.objective).not.toContain('Ears: Normal');
    expect(draft.status).toBe('Draft');
  });
  it('carries nonnumeric observations into SOAP without fabricated measurements', async () => {
    const tx = fixture();
    const visit = await tx.visit.findFirst();
    tx.visit.findFirst.mockResolvedValueOnce({ ...visit, intake: { ...visit.intake, respiratoryRate: null, respiratoryPattern: 'Pant', crtSeconds: null, crtAssessment: 'UnableToAssess' } } as never);
    await new VisitRecordsService().ensureDraftForVisitTx(tx as unknown as Prisma.TransactionClient, 'visit', 'org', 'location', 'author');
    const draft = tx.soapNote.create.mock.calls[0]![0].data;
    expect(draft.objective).toContain('Respiratory rate: Pant');
    expect(draft.objective).toContain('CRT: Unable to Assess');
    expect(draft.objective).not.toContain('Pant rpm');
    expect(draft.objective).not.toContain('Unable to Assess sec');
  });
  it('returns an existing draft without overwriting clinical edits', async () => {
    const existing = { id: 'draft', subjective: 'Clinician-authored history', objective: 'Clinician-authored exam' };
    const tx = fixture(existing);
    expect(await new VisitRecordsService().ensureDraftForVisitTx(tx as unknown as Prisma.TransactionClient, 'visit', 'org', 'location', 'author')).toBe(existing);
    expect(tx.soapNote.create).not.toHaveBeenCalled();
  });
});

describe('SPA-47 exam draft synchronization', () => {
  it('repairs missing diagnosis and plan while preserving authored sections', async () => {
    const tx = fixture({ id: 'draft', version: 3, subjective: 'Authored history', objective: 'Authored exam', assessment: null, plan: '' });
    await new VisitRecordsService().syncExamDraftTx(tx as unknown as Prisma.TransactionClient, 'visit', 'org', 'location');
    expect(tx.soapNote.updateMany).toHaveBeenCalledWith({
      where: { id: 'draft', version: 3, status: { in: ['Draft', 'ReadyForReview'] } },
      data: { assessment: 'Assessment', plan: 'Internal plan', version: { increment: 1 } },
    });
  });
  it('refreshes generated fields after later edits without overwriting authored text', async () => {
    const tx = fixture({ id: 'draft', version: 2, subjective: 'Authored history', objective: 'Authored exam', assessment: 'Old diagnosis', plan: 'Authored plan' });
    const previous = await tx.visit.findFirst();
    previous.examFindings.assessment = 'Old diagnosis';
    tx.visit.findFirst.mockResolvedValue({ ...previous, examFindings: { ...previous.examFindings, assessment: 'New diagnosis' } });
    await new VisitRecordsService().syncExamDraftTx(tx as unknown as Prisma.TransactionClient, 'visit', 'org', 'location', previous as never);
    expect(tx.soapNote.updateMany.mock.calls[0]![0].data).toEqual({ assessment: 'New diagnosis', version: { increment: 1 } });
  });
  it('does not write when there is no open draft (including signed records)', async () => {
    const tx = fixture();
    await new VisitRecordsService().syncExamDraftTx(tx as unknown as Prisma.TransactionClient, 'visit', 'org', 'location');
    expect(tx.soapNote.updateMany).not.toHaveBeenCalled();
    expect(tx.soapNote.create).not.toHaveBeenCalled();
  });
  it('rejects concurrent record changes', async () => {
    const tx = fixture({ id: 'draft', version: 1, assessment: null });
    tx.soapNote.updateMany.mockResolvedValue({ count: 0 });
    await expect(new VisitRecordsService().syncExamDraftTx(tx as unknown as Prisma.TransactionClient, 'visit', 'org', 'location')).rejects.toThrow('changed elsewhere');
  });
});
