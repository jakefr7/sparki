import { Body, Controller, Get, Put } from '@nestjs/common';
import { prisma } from '@sparki/db';
import { CurrentUser } from '../auth/current-user.decorator';
import { requireAdminSettingsManager } from '../auth/permissions';
import type { AuthenticatedUser } from '../auth/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { updateVisitPolicySchema, type UpdateVisitPolicyInput } from './dto/visit-policy.schema';

@Controller('visit-policy')
export class VisitPolicyController {
  @Get()
  async get(@CurrentUser() user: AuthenticatedUser) {
    const location = await prisma.location.findFirstOrThrow({
      where: { id: user.locationId, organizationId: user.organizationId },
      select: { allowCheckoutWithOutstandingBalance: true },
    });
    return location;
  }

  @Put()
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateVisitPolicySchema)) body: UpdateVisitPolicyInput,
  ) {
    requireAdminSettingsManager(user);
    const before = await prisma.location.findFirstOrThrow({ where: { id: user.locationId, organizationId: user.organizationId } });
    const updated = await prisma.location.update({
      where: { id: before.id },
      data: { allowCheckoutWithOutstandingBalance: body.allowCheckoutWithOutstandingBalance },
      select: { allowCheckoutWithOutstandingBalance: true },
    });
    await prisma.schedulerConfigChange.create({
      data: {
        organizationId: user.organizationId,
        locationId: user.locationId,
        actorId: user.id,
        entityType: 'VisitPolicy',
        entityId: user.locationId,
        action: 'Updated',
        before: { allowCheckoutWithOutstandingBalance: before.allowCheckoutWithOutstandingBalance },
        after: updated,
      },
    });
    return updated;
  }
}
