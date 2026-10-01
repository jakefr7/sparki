import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@sparki/db';
import type { AuthenticatedUser } from '../auth/types';
import { requireRole } from '../auth/require-role';
import { VisitBillingService } from './visit-billing.service';
import { renderPatientDocument, type PatientDocument } from './patient-document-renderer';

export type VisitDocumentKind = 'record' | 'discharge' | 'receipt';
const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
const person = (user: { firstName: string; lastName: string; displayName: string | null } | null) => user ? user.displayName || `${user.firstName} ${user.lastName}` : 'Not recorded';

export function readableExam(value: string | null): string {
  if (!value) return '';
  try {
    const parsed = JSON.parse(value) as { kind?: string; general?: { painScore?: string; bodyConditionScore?: string }; systems?: Record<string, { documented?: boolean; status?: string; notes?: string }>; additionalNotes?: string };
    if (parsed.kind !== 'sparki-small-animal-exam') return value;
    const labels: Record<string, string> = { eyes: 'Eyes', ears: 'Ears', noseThroat: 'Nose/throat', oralDental: 'Oral/dental', cardiovascular: 'Cardiovascular', respiratory: 'Respiratory', abdomen: 'Abdomen/GI', urogenital: 'Urogenital', musculoskeletal: 'Musculoskeletal', neurologic: 'Neurologic', skinCoat: 'Skin/coat', lymphNodes: 'Peripheral lymph nodes' };
    return [parsed.general?.painScore && `Pain: ${parsed.general.painScore}`, parsed.general?.bodyConditionScore && `Body condition: ${parsed.general.bodyConditionScore}/9`, ...Object.entries(parsed.systems ?? {}).filter(([, finding]) => finding.documented === true).map(([name, finding]) => `${labels[name] ?? name}: ${finding.status ?? 'Not examined'}${finding.notes ? ` - ${finding.notes}` : ''}`), parsed.additionalNotes].filter(Boolean).join('\n');
  } catch { return value; }
}

@Injectable()
export class VisitDocumentsService {
  constructor(private readonly billing: VisitBillingService) {}

  async generate(user: AuthenticatedUser, visitId: string, kind: VisitDocumentKind) {
    requireRole(user, kind === 'receipt' ? ['OWNER', 'PRACTICE_MANAGER', 'RECEPTIONIST'] : ['OWNER', 'PRACTICE_MANAGER', 'VETERINARIAN', 'TECHNICIAN', 'ASSISTANT', 'RECEPTIONIST']);
    const visit = await prisma.visit.findFirst({
      where: { id: visitId, organizationId: user.organizationId, locationId: user.locationId },
      include: { organization: true, location: true, patient: true, client: true, appointment: true, discharge: true, soapNotes: { where: { voidedAt: null }, include: { author: true, veterinarian: true }, orderBy: { createdAt: 'asc' } } },
    });
    if (!visit) throw new NotFoundException('Visit not found.');
    const date = (value: Date) => value.toLocaleString('en-US', { timeZone: visit.location.timeZone, dateStyle: 'medium', timeStyle: 'short' });
    const document: PatientDocument = {
      title: kind === 'record' ? 'Medical record' : kind === 'discharge' ? 'Discharge instructions' : 'Invoice / receipt',
      clinic: visit.organization.name,
      contact: [visit.organization.addressLine1, visit.organization.addressLine2, [visit.organization.city, visit.organization.state, visit.organization.postalCode].filter(Boolean).join(' '), visit.organization.phone, visit.organization.email].filter(Boolean).join(' | '),
      patient: visit.patient.name,
      identifiers: [visit.patient.species, visit.patient.breed, visit.client && `Client: ${visit.client.firstName} ${visit.client.lastName}`, `Visit: ${date(visit.appointment?.scheduledAt ?? visit.createdAt)}`, `Visit ID: ${visit.id}`].filter(Boolean).join(' | '),
      generatedAt: `${date(new Date())} (${visit.location.timeZone})`,
      sections: [],
    };
    if (kind === 'record') {
      const signed = visit.soapNotes.filter((note) => note.status === 'Locked');
      if (!signed.length) throw new ConflictException('Sign the medical record before downloading a final record.');
      for (const note of signed) {
        document.sections.push({ title: note.amendsSoapNoteId ? 'Amendment' : 'Signed record', text: [`Author: ${person(note.author)}`, `Signer: ${person(note.veterinarian)}`, `Signed: ${note.lockedAt || note.signedAt ? date((note.lockedAt ?? note.signedAt)!) : 'Not recorded'}`, note.amendmentReason && `Reason: ${note.amendmentReason}`, `Record ID: ${note.id}`, note.amendsSoapNoteId && `Amends: ${note.amendsSoapNoteId}`].filter(Boolean).join('\n') });
        for (const [key, title] of [['subjective', 'Subjective'], ['objective', 'Objective'], ['assessment', 'Assessment'], ['plan', 'Plan']] as const) document.sections.push({ title, text: key === 'objective' ? readableExam(note[key]) : note[key] || 'Not recorded.' });
      }
      // Amendments are retained separately by the existing record workflow.
      for (const note of visit.soapNotes.filter((entry) => entry.status === 'Amended')) {
        document.sections.push({ title: 'Amendment', text: [`Author: ${person(note.author)}`, `Created: ${date(note.createdAt)}`, `Reason: ${note.amendmentReason || 'Not recorded'}`, `Amends: ${note.amendsSoapNoteId || 'Not recorded'}`, `Subjective: ${note.subjective || 'Not recorded'}`, `Objective: ${readableExam(note.objective) || 'Not recorded'}`, `Assessment: ${note.assessment || 'Not recorded'}`, `Plan: ${note.plan || 'Not recorded'}`].join('\n') });
      }
    } else if (kind === 'discharge') {
      if (!visit.discharge) throw new ConflictException('Prepare discharge instructions before downloading them.');
      document.sections = [
        { title: 'Home care', text: visit.discharge.instructions },
        { title: 'Medication directions', text: visit.discharge.medicationInstructions || 'No medication directions recorded.' },
        { title: 'Warning signs', text: visit.discharge.warningSigns || 'No warning signs recorded.' },
        { title: 'Follow-up', text: visit.discharge.followUpPlan || 'No follow-up plan recorded.' },
      ];
    } else {
      const receipt = await this.billing.getReceipt(visitId, user.organizationId, user.locationId);
      document.sections = [
        { title: `Invoice ${receipt.invoiceId}`, text: receipt.lines.map((line) => `${line.description}\nQuantity: ${line.quantity} | Unit price: ${money(line.unitAmountCents)} | Total: ${money(line.totalAmountCents)}`).join('\n\n') || 'No charges.' },
        { title: 'Recorded payments', text: receipt.payments.map((payment) => `${date(payment.recordedAt)} | ${payment.method} | ${money(payment.amountCents)}`).join('\n') || 'No payments recorded.' },
        { title: 'Totals', text: `Total: ${money(receipt.totalCents)}\nRecorded paid: ${money(receipt.amountPaidCents)}\nBalance due: ${money(receipt.remainingBalanceCents)}\nStatus: ${receipt.status}\nPayments reflect clinic-recorded transactions; Sparki does not verify bank or card settlement.` },
      ];
    }
    return { body: await renderPatientDocument(document), fileName: `${kind}-${visit.id}.pdf` };
  }
}
