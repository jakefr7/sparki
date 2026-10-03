const MINUTE_MS = 60_000;
const MINUTES_PER_DAY = 1440;

/** Minutes after midnight on the clinic's own clock. */
export function localMinuteOfDay(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return value('hour') * 60 + value('minute');
}

/**
 * The earliest moment at or after `now` that falls inside the clinic's
 * sending hours (`startMinute` inclusive to `endMinute` exclusive, minutes
 * after local midnight). Returns `now` itself when it is already inside.
 *
 * Sending hours exist so a reminder computed as "two hours before a 7 AM
 * appointment" does not text a client at 5 AM.
 */
export function nextTimeInWindow(
  now: Date,
  timeZone: string,
  startMinute: number,
  endMinute: number,
): Date {
  const minute = localMinuteOfDay(now, timeZone);
  if (minute >= startMinute && minute < endMinute) return now;

  const minutesToStart =
    minute < startMinute ? startMinute - minute : MINUTES_PER_DAY - minute + startMinute;
  // Land on the start of the minute, not partway through it.
  let candidate = new Date(
    Math.floor(now.getTime() / MINUTE_MS) * MINUTE_MS + minutesToStart * MINUTE_MS,
  );
  // A daylight-saving change between now and then shifts the local clock by
  // an hour; correct to the intended local time.
  const drift = startMinute - localMinuteOfDay(candidate, timeZone);
  if (drift !== 0 && Math.abs(drift) <= 120)
    candidate = new Date(candidate.getTime() + drift * MINUTE_MS);
  return candidate;
}
