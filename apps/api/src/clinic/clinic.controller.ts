import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { AllowInactiveClinic } from '../auth/allow-inactive-clinic.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { requireRole } from '../auth/require-role';
import type { AuthenticatedUser } from '../auth/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ClinicService } from './clinic.service';
import { updateClinicSchema, type UpdateClinicInput } from './dto/update-clinic.schema';

const CLINIC_MANAGER_ROLES = ['OWNER', 'PRACTICE_MANAGER'] as const;

@Controller('clinic')
export class ClinicController {
  constructor(private readonly clinic: ClinicService) {}

  @AllowInactiveClinic()
  @Get()
  getClinic(@CurrentUser() user: AuthenticatedUser) {
    return this.clinic.getClinic(user.organizationId);
  }

  @Patch()
  updateClinic(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateClinicSchema)) body: UpdateClinicInput,
  ) {
    requireRole(user, [...CLINIC_MANAGER_ROLES]);
    return this.clinic.updateClinic(user, body);
  }

  @AllowInactiveClinic()
  @Get('onboarding-state')
  getOnboardingState(@CurrentUser() user: AuthenticatedUser) {
    return this.clinic.getOnboardingState(user.organizationId);
  }

  @Post('onboarding/complete')
  completeOnboarding(@CurrentUser() user: AuthenticatedUser) {
    requireRole(user, [...CLINIC_MANAGER_ROLES]);
    return this.clinic.completeOnboarding(user);
  }

  @AllowInactiveClinic()
  @Get('billing')
  getBillingStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.clinic.getBillingStatus(user.organizationId);
  }
}
