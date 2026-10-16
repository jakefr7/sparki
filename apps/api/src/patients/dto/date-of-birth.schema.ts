import { BadRequestException } from '@nestjs/common';
import { prisma } from '@sparki/db';
import { z } from 'zod';

// Normalize DOBs as UTC calendar dates. Future-date validation needs the
// authenticated location and happens in the service, after parsing.
export const dateOfBirthSchema = z.coerce
  .date()
  .transform(
    (date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())),
  );

export function isFutureDateOfBirth(date: Date, timeZone: string, now = new Date()): boolean {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => parts.find((value) => value.type === type)!.value;
  return date.toISOString().slice(0, 10) > `${part('year')}-${part('month')}-${part('day')}`;
}

export async function assertValidDateOfBirth(
  date: Date | null | undefined,
  organizationId: string,
  locationId?: string,
) {
  if (!date) return;
  const location = locationId
    ? await prisma.location.findFirstOrThrow({
        where: { id: locationId, organizationId },
        select: { timeZone: true },
      })
    : null;
  const organization = location
    ? null
    : await prisma.organization.findUniqueOrThrow({
        where: { id: organizationId },
        select: { timezone: true },
      });
  if (isFutureDateOfBirth(date, location?.timeZone ?? organization?.timezone ?? 'UTC')) {
    throw new BadRequestException('Date of birth cannot be in the future');
  }
}
export const ESTIMATED_DATE_OF_BIRTH_REQUIRES_DATE = 'An estimated date of birth needs a date';
