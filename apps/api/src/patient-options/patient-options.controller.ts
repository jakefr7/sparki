import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { prisma } from '@sparki/db';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PatientOptionsService } from './patient-options.service';

const breedSchema = z.object({
  species: z.string().trim().min(1).max(100),
  key: z.string().min(1).max(100).optional(),
  name: z.string().trim().min(1).max(100),
  isActive: z.boolean(),
});
const contactSchema = z.object({
  id: z.string().min(1).optional(),
  hospitalName: z.string().trim().min(1).max(200),
  veterinarian: z.string().trim().max(200).optional(),
  email: z.union([z.string().trim().email(), z.literal('')]).optional(),
  phone: z.string().trim().max(50).optional(),
  address: z.string().trim().max(500).optional(),
});
export const providerSelectionSchema = z.object({
  referringProviderId: z.string().min(1).optional(),
  additionalProviderIds: z.array(z.string().min(1)).max(20).optional(),
});
const requestSchema = z.object({
  contactId: z.string().min(1),
  assigneeId: z.string().min(1),
  requestKey: z.string().uuid(),
});

@Controller()
export class PatientOptionsController {
  constructor(private readonly options: PatientOptionsService) {}
  @Get('patient-options')
  async context(@CurrentUser() user: AuthenticatedUser) {
    const location = await prisma.location.findFirstOrThrow({
      where: { id: user.locationId, organizationId: user.organizationId },
      select: { timeZone: true },
    });
    return location;
  }
  @Get('patient-options/breeds')
  breeds(@CurrentUser() user: AuthenticatedUser) {
    return this.options.breeds(user);
  }
  @Post('patient-options/breeds')
  saveBreed(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(breedSchema)) body: z.infer<typeof breedSchema>,
  ) {
    return this.options.saveBreed(user, body);
  }
  @Get('referral-contacts')
  contacts(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(z.object({ query: z.string().trim().max(200).default('') })))
    query: { query: string },
  ) {
    return this.options.contacts(user, query.query);
  }
  @Post('referral-contacts')
  saveContact(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(contactSchema)) body: z.infer<typeof contactSchema>,
  ) {
    return this.options.saveContact(user, body);
  }
  @Get('patients/:id/providers')
  providers(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.options.providers(user, id);
  }
  @Patch('patients/:id/providers')
  saveProviders(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(providerSelectionSchema))
    body: z.infer<typeof providerSelectionSchema>,
  ) {
    return this.options.replaceProviders(user, id, body);
  }
  @Post('patients/:id/records-requests')
  request(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(requestSchema)) body: z.infer<typeof requestSchema>,
  ) {
    return this.options.recordsRequest(user, id, body);
  }
}
