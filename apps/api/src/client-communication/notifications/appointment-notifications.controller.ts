import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put } from '@nestjs/common';
import { CurrentUser } from '../../auth/current-user.decorator';
import { requireRole } from '../../auth/require-role';
import type { AuthenticatedUser } from '../../auth/types';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { CLIENT_COMMUNICATION_ROLES } from '../client-communication.constants';
import { AppointmentNotificationSettingsService } from './appointment-notification-settings.service';
import { AppointmentNotificationStatusService } from './appointment-notification-status.service';
import {
  previewNotificationSchema,
  updateNotificationSettingsSchema,
  type PreviewNotificationInput,
  type UpdateNotificationSettingsInput,
} from './dto/appointment-notification.schema';
import { NOTIFICATION_SETTINGS_ROLES } from './notification-constants';

/**
 * Automated appointment texts. Settings belong to an owner or practice
 * manager; any clinic staff member can see what was sent for an appointment.
 */
@Controller('client-communication')
export class AppointmentNotificationsController {
  constructor(
    private readonly settings: AppointmentNotificationSettingsService,
    private readonly status: AppointmentNotificationStatusService,
  ) {}

  @Get('notification-settings')
  getSettings(@CurrentUser() user: AuthenticatedUser) {
    requireRole(user, NOTIFICATION_SETTINGS_ROLES);
    return this.settings.get(user);
  }

  @Put('notification-settings')
  updateSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateNotificationSettingsSchema))
    body: UpdateNotificationSettingsInput,
  ) {
    requireRole(user, NOTIFICATION_SETTINGS_ROLES);
    return this.settings.update(user, body);
  }

  @Post('notification-settings/preview')
  @HttpCode(HttpStatus.OK)
  preview(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(previewNotificationSchema)) body: PreviewNotificationInput,
  ) {
    requireRole(user, NOTIFICATION_SETTINGS_ROLES);
    return this.settings.preview(user, body);
  }

  @Get('appointments/:appointmentId/notifications')
  forAppointment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('appointmentId') appointmentId: string,
  ) {
    requireRole(user, CLIENT_COMMUNICATION_ROLES);
    return this.status.forAppointment(user, appointmentId);
  }
}
