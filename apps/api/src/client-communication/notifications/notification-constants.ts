import type {
  AppointmentNotificationKind,
  AppointmentState,
  AppointmentType,
  Prisma,
  UserRole,
} from '@sparki/db';

/** Founder direction 2026-10-02: a manager or owner sets a clinic's automated texts. */
export const NOTIFICATION_SETTINGS_ROLES: UserRole[] = ['OWNER', 'PRACTICE_MANAGER'];

export const NOTIFICATION_KINDS: AppointmentNotificationKind[] = [
  'CONFIRMATION',
  'REMINDER',
  'RESCHEDULED',
  'CANCELLED',
];

/** An appointment that is still going to happen as booked. */
export const UPCOMING_STATES: AppointmentState[] = ['Scheduled', 'PreVisitPending', 'Confirmed'];

export const MAX_REMINDERS = 5;
export const MIN_REMINDER_OFFSET_MINUTES = 15;
export const MAX_REMINDER_OFFSET_MINUTES = 30 * 24 * 60;
/** The reminder offered to a clinic that has not chosen its own: a day before. */
export const STARTING_REMINDER_OFFSET_MINUTES = 24 * 60;

/** Why an automated text was deliberately not sent, in words staff can act on. */
export const SKIP_REASONS = {
  REMINDER_TIME_PASSED: 'The time for this reminder had already passed when it was planned.',
  RULE_DISABLED: 'The clinic turned this message off before it was due.',
  APPOINTMENT_CHANGED: 'The appointment changed before this message was due.',
  APPOINTMENT_PASSED: 'The appointment time had already passed.',
  APPOINTMENT_TYPE_EXCLUDED: 'Automated texts are turned off for this appointment type.',
  OUTSIDE_SEND_HOURS: "The next time inside the clinic's sending hours was after the appointment.",
  TEXTING_NOT_AVAILABLE: 'Texting was not available for the clinic.',
  NO_CLIENT: 'The appointment has no client.',
  NO_TEXTABLE_NUMBER: "The client's number is missing or cannot receive texts.",
  RECIPIENT_CHANGED:
    "The appointment's client or the client's number changed after this message was prepared.",
  NO_RECORDED_AGREEMENT: 'No one has recorded that this client agreed to receive texts.',
  OPTED_OUT: 'The client opted out of texts.',
  TEMPLATE_INCOMPLETE: 'The message uses the clinic phone number, which is not set.',
  CLINIC_TIME_ZONE_INVALID: "The clinic's time zone is not valid.",
} as const;

export type SkipReason = keyof typeof SKIP_REASONS;

export function skipReasonView(code: string | null) {
  if (!code) return null;
  return { code, message: SKIP_REASONS[code as SkipReason] ?? 'This message was not sent.' };
}

/**
 * Whether automated texts go out for an appointment type. A clinic's explicit
 * choice wins. With no choice recorded, every type sends except euthanasia
 * appointments: a routine reminder for one would be a real harm, so it takes
 * a deliberate decision by the clinic to turn those on.
 */
export function automatedTextsAllowed(
  choices: Prisma.JsonValue,
  appointmentTypeSettingId: string | null,
  appointmentType: AppointmentType | null,
): boolean {
  if (
    appointmentTypeSettingId &&
    choices &&
    typeof choices === 'object' &&
    !Array.isArray(choices)
  ) {
    const explicit = choices[appointmentTypeSettingId];
    if (typeof explicit === 'boolean') return explicit;
  }
  return appointmentType !== 'Euthanasia';
}
