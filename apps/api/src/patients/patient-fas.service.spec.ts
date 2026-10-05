import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPatientFasSchema } from './dto/patient-fas.schema';
import { PatientFasService } from './patient-fas.service';
import type { AuthenticatedUser } from '../auth/types';

const db = vi.hoisted(() => ({
  visit: { findFirst: vi.fn(), updateMany: vi.fn() },
  patientFasAssessment: { findFirst: vi.fn(), create: vi.fn(), findMany: vi.fn() },
  patient: { findFirst: vi.fn() },
  location: { findFirst: vi.fn() },
}));
vi.mock('@sparki/db', () => ({
  prisma: { ...db, $transaction: (fn: (tx: typeof db) => unknown) => fn(db) },
}));
const user = {
  id: 'tech',
  name: 'Anna',
  role: 'TECHNICIAN',
  organizationId: 'org',
  locationId: 'location',
} as AuthenticatedUser;
const input = {
  requestId: '043ae871-6a5c-462b-bfb5-6d71a25421ba',
  score: 0,
  handlingNotes: 'Quiet approach helped.',
};
const service = new PatientFasService();
beforeEach(() => {
  vi.resetAllMocks();
  db.visit.findFirst.mockResolvedValue({
    id: 'visit',
    patientId: 'patient',
    state: 'IntakeInProgress',
    version: 2,
    checkout: null,
    soapNotes: [],
  });
  db.visit.updateMany.mockResolvedValue({ count: 1 });
  db.patientFasAssessment.findFirst.mockResolvedValue(null);
  db.patientFasAssessment.create.mockImplementation(({ data }) => ({ id: 'assessment', ...data }));
  db.patient.findFirst.mockResolvedValue({ id: 'patient' });
  db.location.findFirst.mockResolvedValue({ timeZone: 'America/Chicago' });
});
describe('FAS capture', () => {
  it('accepts zero and five; rejects fractions, out-of-range values and forged attribution', () => {
    expect(createPatientFasSchema.safeParse(input).success).toBe(true);
    expect(createPatientFasSchema.safeParse({ ...input, score: 5 }).success).toBe(true);
    for (const score of [-1, 6, 1.5])
      expect(createPatientFasSchema.safeParse({ ...input, score }).success).toBe(false);
    expect(createPatientFasSchema.safeParse({ ...input, authorId: 'other' }).success).toBe(false);
  });
  it('records server attribution and a real zero score without changing prior assessments', async () => {
    const result = await service.create('visit', user, input);
    expect(result).toMatchObject({
      score: 0,
      authorId: 'tech',
      authorName: 'Anna',
      authorRole: 'TECHNICIAN',
      organizationId: 'org',
      locationId: 'location',
      patientId: 'patient',
    });
    expect(db.visit.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'visit', organizationId: 'org', locationId: 'location', version: 2 },
      }),
    );
  });
  it.each(['RECEPTIONIST', 'PRACTICE_MANAGER'])('denies capture by %s', async (role) => {
    await expect(
      service.create('visit', { ...user, role } as AuthenticatedUser, input),
    ).rejects.toThrow('requires');
    expect(db.visit.findFirst).not.toHaveBeenCalled();
  });
  it('recovers an identical retry even after signoff without inserting another row', async () => {
    db.visit.findFirst.mockResolvedValue({ id: 'visit', soapNotes: [{ id: 'signed' }] });
    db.patientFasAssessment.findFirst.mockResolvedValue({ ...input, authorId: user.id });
    await service.create('visit', user, input);
    expect(db.patientFasAssessment.create).not.toHaveBeenCalled();
    db.patientFasAssessment.findFirst.mockResolvedValue({ ...input, authorId: 'someone-else' });
    await expect(service.create('visit', user, input)).rejects.toThrow('already used');
  });
  it.each([
    { state: 'Archived' },
    { checkout: { id: 'checkout' } },
    { soapNotes: [{ id: 'signed' }] },
  ])('prevents capture after closure/signoff: %j', async (extra) => {
    db.visit.findFirst.mockResolvedValue({ state: 'IntakeInProgress', soapNotes: [], ...extra });
    await expect(service.create('visit', user, input)).rejects.toThrow('closed');
    expect(db.patientFasAssessment.create).not.toHaveBeenCalled();
  });
  it('does not insert when concurrent signoff/closure changes the visit', async () => {
    db.visit.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.create('visit', user, input)).rejects.toThrow('changed elsewhere');
    expect(db.patientFasAssessment.create).not.toHaveBeenCalled();
  });
  it('uses organization/location/patient scope for history and rejects a foreign cursor', async () => {
    await expect(service.list('patient', user, 'foreign')).rejects.toThrow('page not found');
    expect(db.patientFasAssessment.findFirst).toHaveBeenCalledWith({
      where: { organizationId: 'org', locationId: 'location', patientId: 'patient', id: 'foreign' },
    });
  });
  it('returns a page and cursor so older history remains reachable', async () => {
    db.patientFasAssessment.findMany.mockResolvedValue(
      Array.from({ length: 21 }, (_, id) => ({ id: String(id) })),
    );
    const result = await service.list('patient', user);
    expect(result.items).toHaveLength(20);
    expect(result.nextCursor).toBe('19');
    expect(result.timeZone).toBe('America/Chicago');
  });
});
