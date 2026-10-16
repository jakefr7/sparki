/** Renders a PascalCase/underscore enum value (e.g. from Prisma) as a readable label. */
export function enumLabel(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

/** Formats a clock time (e.g. "2:30 PM") from an ISO timestamp. */
export function timeLabel(value: string): string {
  return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/**
 * Confirmed clinic-facing labels for AppointmentState (Anna, Phase 2 cleanup
 * pass): pre-arrival states all read "Upcoming", arrival-adjacent states
 * read "Checked In". Everything else (Completed, Cancelled, NoShow,
 * Rescheduled) is already readable via enumLabel. Display-only — the
 * backend AppointmentState enum is unchanged.
 */
export function appointmentStatusLabel(state: string): string {
  if (state === 'Scheduled' || state === 'Draft' || state === 'PreVisitPending' || state === 'Confirmed') {
    return 'Upcoming';
  }
  if (state === 'Arrived' || state === 'VisitCreated') {
    return 'Checked In';
  }
  return enumLabel(state);
}

/**
 * Same as enumLabel, with the clinic-facing label for active intake.
 */
export function visitStateLabel(state: string): string {
  if (state === 'IntakeInProgress') return 'Intake In Progress';
  return enumLabel(state);
}

/** Formats a patient's age from its date of birth. `short` is for dense list rows. */
export function formatAge(
  dateOfBirth: string | null,
  style: 'long' | 'short' = 'long',
): string | null {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return null;
  // Whole birthdays on the calendar: an age entered as "5 years" must read
  // 5 on the day it is entered. The DOB is a UTC calendar date; today is local.
  const today = new Date();
  const beforeBirthday =
    today.getMonth() < dob.getUTCMonth() ||
    (today.getMonth() === dob.getUTCMonth() && today.getDate() < dob.getUTCDate());
  const years = today.getFullYear() - dob.getUTCFullYear() - (beforeBirthday ? 1 : 0);

  if (style === 'short') {
    return years < 1 ? '<1 yr' : `${years} yr`;
  }

  if (years < 1) return 'under 1 year old';
  return `${years} ${years === 1 ? 'year' : 'years'} old`;
}
