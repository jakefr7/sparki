import { Body, Controller, Get, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { requireAdminSettingsManager } from '../auth/permissions';
import type { AuthenticatedUser } from '../auth/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { DashboardStatusColorsService } from './dashboard-status-colors.service';
import {
  upsertDashboardStatusColorSchema,
  type UpsertDashboardStatusColorInput,
} from './dto/dashboard-status-colors.schema';

@Controller('dashboard-status-colors')
export class DashboardStatusColorsController {
  constructor(private readonly dashboardStatusColors: DashboardStatusColorsService) {}

  @Get()
  getConfig(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboardStatusColors.getConfig(user);
  }

  @Post()
  upsertColor(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(upsertDashboardStatusColorSchema))
    body: UpsertDashboardStatusColorInput,
  ) {
    requireAdminSettingsManager(user);
    return this.dashboardStatusColors.upsertColor(user, body);
  }
}
