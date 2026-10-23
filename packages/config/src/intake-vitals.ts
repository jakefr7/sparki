export const CRT_ASSESSMENTS = ['LessThanOneSecond', 'OneToTwoSeconds', 'MoreThanTwoSeconds', 'UnableToAssess', 'NotAssessed'] as const;
export type CrtAssessment = (typeof CRT_ASSESSMENTS)[number];
export const CRT_LABELS: Record<CrtAssessment, string> = {
  LessThanOneSecond: '< 1 second',
  OneToTwoSeconds: '1–2 seconds (Normal)',
  MoreThanTwoSeconds: '> 2 seconds',
  UnableToAssess: 'Unable to Assess',
  NotAssessed: 'Not Assessed',
};
export function respiratoryLabel(rate?: number | null, pattern?: string | null): string | null {
  return pattern === 'Pant' ? 'Pant' : rate != null ? `${rate} rpm` : null;
}
export function crtLabel(seconds?: number | null, assessment?: string | null): string | null {
  return assessment && assessment in CRT_LABELS ? CRT_LABELS[assessment as CrtAssessment] : seconds != null ? `${seconds} sec` : null;
}
