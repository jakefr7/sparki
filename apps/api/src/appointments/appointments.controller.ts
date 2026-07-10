import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AppointmentsService } from './appointments.service';
import {
  createAppointmentSchema,
  createAppointmentWithNewPatientSchema,
  linkAppointmentPatientSchema,
  moveAppointmentSchema,
  updateConfirmationStatusSchema,
  updateRecordsPrepStatusSchema,
  type CreateAppointmentInput,
  type CreateAppointmentWithNewPatientInput,
  type LinkAppointmentPatientInput,
  type MoveAppointmentInput,
  type UpdateConfirmationStatusInput,
  type UpdateRecordsPrepStatusInput,
} from './dto/create-appointment.schema';

@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createAppointmentSchema)) body: CreateAppointmentInput,
  ) {
    return this.appointments.create(user.organizationId, user.locationId, user.id, body);
  }

  /** Scheduler's "New Patient" flow — see AppointmentsService.createWithNewPatient. */
  @Post('new-patient')
  createWithNewPatient(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createAppointmentWithNewPatientSchema))
    body: CreateAppointmentWithNewPatientInput,
  ) {
    return this.appointments.createWithNewPatient(
      user.organizationId,
      user.locationId,
      user.id,
      body,
    );
  }

  @Get(':id')
  findById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.appointments.findById(id, user.organizationId);
  }

  @Patch(':id/records-prep-status')
  updateRecordsPrepStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateRecordsPrepStatusSchema)) body: UpdateRecordsPrepStatusInput,
  ) {
    return this.appointments.updateRecordsPrepStatus(id, user.organizationId, body);
  }

  @Patch(':id/confirmation-status')
  updateConfirmationStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateConfirmationStatusSchema)) body: UpdateConfirmationStatusInput,
  ) {
    return this.appointments.updateConfirmationStatus(id, user.organizationId, body);
  }

  @Post(':id/link-patient')
  linkPatient(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(linkAppointmentPatientSchema)) body: LinkAppointmentPatientInput,
  ) {
    return this.appointments.linkPatient(id, user.organizationId, body);
  }

  @Patch(':id/move')
  move(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(moveAppointmentSchema)) body: MoveAppointmentInput,
  ) {
    return this.appointments.move(id, user.organizationId, user.locationId, body);
  }

  @Post(':id/confirm')
  confirm(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.appointments.confirm(id, user.organizationId);
  }

  @Post(':id/arrive')
  markArrived(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.appointments.markArrived(id, user.organizationId);
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.appointments.cancel(id, user.organizationId);
  }

  @Post(':id/no-show')
  markNoShow(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.appointments.markNoShow(id, user.organizationId);
  }
}
