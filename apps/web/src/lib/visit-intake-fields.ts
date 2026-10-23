import type { VisitDetail } from './patient-types';

export const APPETITE_OPTIONS = ['Normal', 'Decreased', 'Increased', 'Not Eating'] as const;

export const GUM_COLOR_OPTIONS = [
  'Pink',
  'Pale',
  'White',
  'Blue/Purple',
  'Red/Injected',
  'Yellow/Icteric',
  'Other',
] as const;

export const WEIGHT_UNIT_OPTIONS = [
  { value: 'LB', label: 'lb' },
  { value: 'KG', label: 'kg' },
] as const;

export const QUICK_REASON_OPTIONS = [
  'Preventive care',
  'Vomiting',
  'Diarrhea',
  'Limping',
  'Skin concern',
  'Ear concern',
  'Follow-up',
  'Medication refill',
] as const;

/** The final technician handoff requires the clinical narrative and vitals.
 * Appointment reason and legacy structured history fields remain persisted,
 * but are not duplicated as required controls in the intake workspace. */
export const REQUIRED_INTAKE_FIELDS = [
  'historyNotes',
  'weight',
  'temperature',
  'heartRate',
  'respiratoryRate',
  'crtSeconds',
  'gumColor',
] as const;

export type RequiredIntakeField = (typeof REQUIRED_INTAKE_FIELDS)[number];

export type IntakeSectionId =
  | 'intake-story'
  | 'intake-vitals'
  | 'intake-condition'
  | 'intake-safety'
  | 'intake-background';

export interface IntakeSectionMeta {
  id: IntakeSectionId;
  number: string;
  label: string;
  title: string;
  description: string;
  fields: readonly (keyof IntakePayload)[];
  optional: boolean;
}

export const INTAKE_SECTIONS: readonly IntakeSectionMeta[] = [
  {
    id: 'intake-story',
    number: '01',
    label: 'Visit Story',
    title: 'Visit story',
    description: 'What the client is seeing and the history behind it.',
    fields: ['chiefComplaint', 'historyNotes'],
    optional: false,
  },
  {
    id: 'intake-vitals',
    number: '02',
    label: 'Vitals & Triage',
    title: 'Vitals & triage',
    description: 'A dependable baseline, captured fast.',
    fields: ['weight', 'temperature', 'heartRate', 'respiratoryRate', 'crtSeconds', 'gumColor'],
    optional: false,
  },
  {
    id: 'intake-condition',
    number: '03',
    label: 'Current Condition',
    title: 'Current condition',
    description: 'Presentation and symptoms reported today.',
    fields: ['attitude', 'appearance'],
    optional: false,
  },
  {
    id: 'intake-safety',
    number: '04',
    label: 'Medications & Safety',
    title: 'Medications & safety',
    description: 'Anything that changes prescribing, handling, or anesthesia decisions.',
    fields: ['currentMedications', 'allergies'],
    optional: false,
  },
  {
    id: 'intake-background',
    number: '05',
    label: 'Background',
    title: 'Background',
    description: 'Additional history that may influence risk or the care plan.',
    fields: [],
    optional: true,
  },
] as const;

const BACKGROUND_FIELDS = ['vaccinationHistory', 'recentTravel', 'specialDiet', 'supplements'] as const;

export function weightUnitLabel(unit: string): string {
  return unit === 'KG' ? 'kg' : 'lb';
}

export type VisitIntake = NonNullable<VisitDetail['intake']>;

export interface IntakePayload {
  chiefComplaint?: string | null;
  historyNotes?: string | null;
  weight?: number | null;
  weightUnit?: string | null;
  temperature?: number | null;
  heartRate?: number | null;
  respiratoryRate?: number | null;
  respiratoryPattern?: 'Pant' | null;
  crtAssessment?: import('@sparki/config').CrtAssessment | null;
  crtSeconds?: number | null;
  gumColor?: string | null;
  appetite?: string | null;
  vomiting?: boolean;
  diarrhea?: boolean;
  medicationsAllergies?: string | null;
  vaccinationHistory?: string | null;
  recentTravel?: string | null;
  specialDiet?: string | null;
  supplements?: string | null;
  attitude?: string | null;
  appearance?: string | null;
  allergies?: string | null;
  sedationIssues?: string | null;
  pastSurgeries?: string | null;
  currentMedications?: string | null;
  sneezing?: boolean;
  systemicConcerns?: string | null;
  painScore?: number | null;
  painScale?: string | null;
}

export function payloadFromIntake(intake: VisitDetail['intake']): IntakePayload {
  if (!intake) return {};
  if (intake.historyNotes) return { ...intake };

  const legacyHistory = [
    intake.chiefComplaint && `Concern: ${intake.chiefComplaint}`,
    intake.attitude && `Attitude: ${intake.attitude}`,
    intake.appearance && `Appearance: ${intake.appearance}`,
    intake.currentMedications && `Current medications: ${intake.currentMedications}`,
    intake.allergies && `Allergies: ${intake.allergies}`,
    intake.medicationsAllergies && `Medication/allergy notes: ${intake.medicationsAllergies}`,
    intake.vaccinationHistory && `Vaccination history: ${intake.vaccinationHistory}`,
    intake.recentTravel && `Recent travel: ${intake.recentTravel}`,
    intake.specialDiet && `Special diet: ${intake.specialDiet}`,
    intake.supplements && `Supplements: ${intake.supplements}`,
  ].filter(Boolean).join('\n');

  return { ...intake, historyNotes: legacyHistory || null };
}

function isFilled(value: IntakePayload[keyof IntakePayload]): boolean {
  return value !== null && value !== undefined && value !== '';
}

function fieldFilled(payload: IntakePayload, field: keyof IntakePayload): boolean {
  if (field === 'respiratoryRate') return isFilled(payload.respiratoryPattern) || isFilled(payload.respiratoryRate);
  if (field === 'crtSeconds') return isFilled(payload.crtAssessment) || isFilled(payload.crtSeconds);
  return isFilled(payload[field]);
}

export function completedRequiredFields(payload: IntakePayload): number {
  return REQUIRED_INTAKE_FIELDS.filter((field) => fieldFilled(payload, field)).length;
}

export function missingRequiredFields(payload: IntakePayload): RequiredIntakeField[] {
  return REQUIRED_INTAKE_FIELDS.filter((field) => !fieldFilled(payload, field));
}

export function completedSections(payload: IntakePayload): Set<IntakeSectionId> {
  return new Set(
    INTAKE_SECTIONS.filter((section) =>
      section.optional
        ? BACKGROUND_FIELDS.some((field) => isFilled(payload[field as keyof IntakePayload]))
        : section.fields.every((field) => fieldFilled(payload, field)),
    ).map((section) => section.id),
  );
}

/** Which section a given required field lives in — used to jump-and-focus
 *  from the "missing information" list in the context panel. */
export function sectionForField(field: keyof IntakePayload): IntakeSectionId {
  const match = INTAKE_SECTIONS.find((section) => (section.fields as readonly string[]).includes(field));
  return match?.id ?? 'intake-story';
}

/** Non-optional lookup by id — INTAKE_SECTIONS is a fixed, known-complete
 *  list, so a missing id here is a programmer error, not a runtime case. */
export function sectionMeta(id: IntakeSectionId): IntakeSectionMeta {
  const match = INTAKE_SECTIONS.find((section) => section.id === id);
  if (!match) throw new Error(`Unknown intake section: ${id}`);
  return match;
}

const FIELD_LABELS: Partial<Record<keyof IntakePayload, string>> = {
  chiefComplaint: 'Reason for visit',
  historyNotes: 'Medical history',
  weight: 'Weight',
  temperature: 'Temperature',
  heartRate: 'Heart rate',
  respiratoryRate: 'Respiratory rate',
  crtSeconds: 'Capillary refill',
  gumColor: 'Gum color',
  attitude: 'Mentation',
  appearance: 'General appearance',
  allergies: 'Allergies',
  currentMedications: 'Current medications',
};

export function fieldLabel(field: keyof IntakePayload): string {
  return FIELD_LABELS[field] ?? String(field);
}

export type TriageLevel = 'unassessed' | 'stable' | 'attention' | 'urgent';

/** Derived, read-only triage read — no new field is persisted for this since
 *  a manually-set urgency selector would need an API/schema change out of
 *  scope for this visual redesign. Flags on values a technician would want
 *  called out immediately: abnormal gum color, slow CRT, depressed mentation,
 *  or a missing vitals baseline. */
export function derivedTriageLevel(payload: IntakePayload): TriageLevel {
  const vitalsCaptured = [payload.temperature, payload.heartRate, payload.respiratoryRate, payload.crtSeconds].some(
    (value) => value !== null && value !== undefined,
  );
  if (!vitalsCaptured && !payload.gumColor && !payload.attitude) return 'unassessed';

  const urgentGums = payload.gumColor === 'White' || payload.gumColor === 'Blue/Purple';
  const urgentMentation = payload.attitude === 'Obtunded';
  const urgentCrt = typeof payload.crtSeconds === 'number' && payload.crtSeconds >= 3;
  if (urgentGums || urgentMentation || urgentCrt) return 'urgent';

  const attentionGums = payload.gumColor === 'Pale' || payload.gumColor === 'Red/Injected' || payload.gumColor === 'Yellow/Icteric';
  const attentionMentation = payload.attitude === 'Depressed';
  const attentionTemp = typeof payload.temperature === 'number' && (payload.temperature < 99 || payload.temperature > 103.5);
  const attentionHr = typeof payload.heartRate === 'number' && (payload.heartRate < 60 || payload.heartRate > 180);
  if (attentionGums || attentionMentation || attentionTemp || attentionHr) return 'attention';

  return 'stable';
}

export const TRIAGE_LABELS: Record<TriageLevel, string> = {
  unassessed: 'Not yet assessed',
  stable: 'Stable',
  attention: 'Needs attention',
  urgent: 'Urgent',
};
