import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { requireAdminSettingsManager, requireSchedulerSettingsManager } from '../auth/permissions';
import type { AuthenticatedUser } from '../auth/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  setSlotTemplateVisibilitySchema,
  updateSchedulerSettingsSchema,
  upsertAppointmentTypeSettingSchema,
  upsertSlotTemplateSchema,
  type SetSlotTemplateVisibilityInput,
  type UpdateSchedulerSettingsInput,
  type UpsertAppointmentTypeSettingInput,
  type UpsertSlotTemplateInput,
} from './dto/scheduler-config.schema';
import { SchedulerConfigService } from './scheduler-config.service';

@Controller('scheduler-config')
export class SchedulerConfigController {
  constructor(private readonly schedulerConfig: SchedulerConfigService) {}

  @Get()
  getConfig(@CurrentUser() user: AuthenticatedUser) {
    return this.schedulerConfig.getConfig(user);
  }

  @Patch('settings')
  updateSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateSchedulerSettingsSchema))
    body: UpdateSchedulerSettingsInput,
  ) {
    requireSchedulerSettingsManager(user);
    return this.schedulerConfig.updateSettings(user, body);
  }

  @Post('appointment-types')
  upsertAppointmentType(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(upsertAppointmentTypeSettingSchema))
    body: UpsertAppointmentTypeSettingInput,
  ) {
    requireAdminSettingsManager(user);
    return this.schedulerConfig.upsertAppointmentType(user, body);
  }

  @Get('appointment-types/eligible-providers')
  eligibleProviders(@CurrentUser() user: AuthenticatedUser) {
    requireAdminSettingsManager(user);
    return this.schedulerConfig.listEligibleProviders(user);
  }

  @Post('slot-templates')
  upsertSlotTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(upsertSlotTemplateSchema))
    body: UpsertSlotTemplateInput,
  ) {
    requireSchedulerSettingsManager(user);
    return this.schedulerConfig.upsertSlotTemplate(user, body);
  }

  @Patch('slot-templates/:id/visibility')
  setSlotTemplateVisibility(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(setSlotTemplateVisibilitySchema))
    body: SetSlotTemplateVisibilityInput,
  ) {
    requireSchedulerSettingsManager(user);
    return this.schedulerConfig.setSlotTemplateVisibility(user, id, body.isActive);
  }

  @Delete('slot-templates/:id')
  deleteSlotTemplate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    requireSchedulerSettingsManager(user);
    return this.schedulerConfig.deleteSlotTemplate(user, id);
  }
}
