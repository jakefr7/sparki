import { describe, expect, it, vi } from 'vitest';
import { VisitRecordsService } from './visit-records.service';
import type { Prisma } from '@sparki/db';

function fixture(existing: unknown = null) {
  const tx = {
    visit: { findFirst: vi.fn().mockResolvedValue({ id: 'visit', patientId: 'patient', medicalRecordId: 'record', primaryVeterinarianId: 'doctor', examFindings: { subjective: null, objective: JSON.stringify({ kind: 'sparki-small-animal-exam', systems: { eyes: { status: 'Normal', documented: true }, ears: { status: 'Normal', documented: false } } }), assessment: 'Assessment', plan: 'Internal plan' }, intake: { chiefComplaint: 'Concern', historyNotes: 'History', weight: 0, weightUnit: 'KG', temperature: 101, heartRate: 90, respiratoryRate: 20, crtSeconds: 1, gumColor: 'Pink', painScore: 0, painScale: 'Recorded scale' } }), update: vi.fn() },
    medicalRecord: { upsert: vi.fn().mockResolvedValue({ id: 'record' }) },
    soapNote: { findFirst: vi.fn().mockResolvedValue(existing), create: vi.fn().mockImplementation(({ data }) => data) },
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
  it('returns an existing draft without overwriting clinical edits', async () => {
    const existing = { id: 'draft', subjective: 'Clinician-authored history', objective: 'Clinician-authored exam' };
    const tx = fixture(existing);
    expect(await new VisitRecordsService().ensureDraftForVisitTx(tx as unknown as Prisma.TransactionClient, 'visit', 'org', 'location', 'author')).toBe(existing);
    expect(tx.soapNote.create).not.toHaveBeenCalled();
  });
});
