import type { AppointmentNotificationKind } from '@sparki/db';

/** Longest wording a clinic may save for one automated text. */
export const MAX_TEMPLATE_LENGTH = 480;

const COMMON_PLACEHOLDERS = [
  'clinic_name',
  'clinic_phone',
  'client_first_name',
  'patient_name',
  'appointment_date',
  'appointment_time',
] as const;

/**
 * What a clinic's wording may refer to. Deliberately scheduling details
 * only: no appointment type, reason, or anything clinical, so a text can
 * never reveal why an animal is coming in.
 */
export const PLACEHOLDERS: Record<AppointmentNotificationKind, readonly string[]> = {
  CONFIRMATION: COMMON_PLACEHOLDERS,
  REMINDER: COMMON_PLACEHOLDERS,
  RESCHEDULED: [...COMMON_PLACEHOLDERS, 'previous_date', 'previous_time'],
  CANCELLED: COMMON_PLACEHOLDERS,
};

/**
 * Wording offered to a clinic that has not written its own yet. It is a
 * starting point to edit, not a saved setting: nothing sends until a manager
 * or owner turns a message on.
 */
export const STARTING_TEMPLATES: Record<AppointmentNotificationKind, string> = {
  CONFIRMATION:
    '{clinic_name}: {patient_name} is booked for {appointment_date} at {appointment_time}. Questions? Call {clinic_phone}.',
  REMINDER:
    '{clinic_name}: a reminder that {patient_name} has an appointment on {appointment_date} at {appointment_time}. Call {clinic_phone} to make a change.',
  RESCHEDULED:
    "{clinic_name}: {patient_name}'s appointment has moved to {appointment_date} at {appointment_time}. Call {clinic_phone} with any questions.",
  CANCELLED:
    "{clinic_name}: {patient_name}'s appointment on {appointment_date} at {appointment_time} has been cancelled. Call {clinic_phone} to rebook.",
};

export type TemplateValues = Partial<Record<string, string>> & { clinic_name: string };

const PLACEHOLDER_PATTERN = /\{([a-z_]+)\}/g;
const OPT_OUT_LINE = 'Reply STOP to opt out.';

export function placeholdersIn(template: string): string[] {
  return [...new Set([...template.matchAll(PLACEHOLDER_PATTERN)].map((match) => match[1]!))];
}

/** Why a clinic's wording cannot be saved, in words a manager can act on. Empty when it is fine. */
export function templateProblems(kind: AppointmentNotificationKind, template: string): string[] {
  const problems: string[] = [];
  const text = template.trim();
  if (!text) problems.push('Write the message.');
  if (text.length > MAX_TEMPLATE_LENGTH) {
    problems.push(`Keep the message to ${MAX_TEMPLATE_LENGTH} characters or fewer.`);
  }
  const allowed = PLACEHOLDERS[kind];
  for (const name of placeholdersIn(text)) {
    if (!allowed.includes(name)) problems.push(`{${name}} is not available for this message.`);
  }
  if (/[{}]/.test(text.replace(PLACEHOLDER_PATTERN, ''))) {
    problems.push('Curly brackets are only for the listed placeholders, such as {patient_name}.');
  }
  return problems;
}

/**
 * Turns a clinic's wording into the text a client receives.
 *
 * Two things are added no matter what the clinic wrote, because carriers
 * require them of every automated text and a clinic should not be able to
 * get its number suspended by editing a template: the clinic's name, and how
 * to opt out.
 */
export function renderTemplate(template: string, values: TemplateValues): string {
  let text = template
    .trim()
    .replace(PLACEHOLDER_PATTERN, (_match, name: string) => values[name] ?? '')
    .replace(/[ \t]{2,}/g, ' ');
  if (!template.includes('{clinic_name}')) text = `${values.clinic_name}: ${text}`;
  if (!/\bSTOP\b/i.test(text)) text = `${text} ${OPT_OUT_LINE}`;
  return text;
}

/** "Fri, Oct 9" in the clinic's own time zone. */
export function formatAppointmentDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

/** "2:00 PM" in the clinic's own time zone. */
export function formatAppointmentTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(
    date,
  );
}
