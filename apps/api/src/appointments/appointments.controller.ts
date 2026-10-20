import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';
import { requireRole } from '../auth/require-role';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AppointmentsService } from './appointments.service';
import { appointmentAvailabilitySchema, type AppointmentAvailabilityInput } from './dto/appointment-availability.schema';
import { scheduleRangeSchema, type ScheduleRangeInput } from './dto/schedule-range.schema';
import {
  createAppointmentSchema,
  cancelAppointmentSchema,
  createAppointmentWithNewPatientSchema,
  linkAppointmentPatientSchema,
  moveAppointmentSchema,
  updateAppointmentNoteSchema,
  updateConfirmationStatusSchema,
  updateRecordsPrepStatusSchema,
  type CreateAppointmentInput,
  type CancelAppointmentInput,
  type CreateAppointmentWithNewPatientInput,
  type LinkAppointmentPatientInput,
  type MoveAppointmentInput,
  type UpdateAppointmentNoteInput,
  type UpdateConfirmationStatusInput,
  type UpdateRecordsPrepStatusInput,
} from './dto/create-appointment.schema';

@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Get('availability/search')
  availability(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(appointmentAvailabilitySchema)) query: AppointmentAvailabilityInput,
  ) {
    return this.appointments.availability(user.organizationId, user.locationId, query);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createAppointmentSchema)) body: CreateAppointmentInput,
  ) {
    requireSchedulingOperator(user);
    return this.appointments.create(user.organizationId, user.locationId, user.id, body);
  }

  /** Scheduler's "New Patient" flow — see AppointmentsService.createWithNewPatient. */
  @Post('new-patient')
  createWithNewPatient(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createAppointmentWithNewPatientSchema))
    body: CreateAppointmentWithNewPatientInput,
  ) {
    requireSchedulingOperator(user);
    return this.appointments.createWithNewPatient(
      user.organizationId,
      user.locationId,
      user.id,
      body,
    );
  }

  @Get('schedule')
  schedule(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(scheduleRangeSchema)) query: ScheduleRangeInput,
  ) {
    return this.appointments.listForScheduleRange(
      user.organizationId,
      user.locationId,
      query.startDate,
      query.endDate,
    );
  }

  @Get(':id')
  findById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.appointments.findById(id, user.organizationId, user.locationId);
  }

  @Patch(':id/records-prep-status')
  updateRecordsPrepStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateRecordsPrepStatusSchema)) body: UpdateRecordsPrepStatusInput,
  ) {
    requireRole(user, ['OWNER', 'PRACTICE_MANAGER', 'TECHNICIAN', 'ASSISTANT']);
    return this.appointments.updateRecordsPrepStatus(id, user.organizationId, user.locationId, body);
  }

  @Patch(':id/confirmation-status')
  updateConfirmationStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateConfirmationStatusSchema)) body: UpdateConfirmationStatusInput,
  ) {
    requireSchedulingOperator(user);
    return this.appointments.updateConfirmationStatus(id, user.organizationId, user.locationId, body);
  }

  @Post(':id/link-patient')
  linkPatient(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(linkAppointmentPatientSchema)) body: LinkAppointmentPatientInput,
  ) {
    requireRole(user, ['OWNER', 'PRACTICE_MANAGER', 'RECEPTIONIST']);
    return this.appointments.linkPatient(id, user.organizationId, user.locationId, body);
  }

  @Patch(':id/move')
  move(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(moveAppointmentSchema)) body: MoveAppointmentInput,
  ) {
    requireSchedulingOperator(user);
    return this.appointments.move(id, user.organizationId, user.locationId, user.id, body);
  }

  @Patch(':id/note')
  updateNote(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateAppointmentNoteSchema)) body: UpdateAppointmentNoteInput,
  ) {
    requireRole(user, ['OWNER', 'PRACTICE_MANAGER', 'RECEPTIONIST', 'VETERINARIAN', 'TECHNICIAN', 'ASSISTANT']);
    return this.appointments.updateNote(id, user.organizationId, user.locationId, body);
  }

  @Post(':id/confirm')
  confirm(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    requireSchedulingOperator(user);
    return this.appointments.confirm(id, user.organizationId, user.locationId, user.id);
  }

  @Post(':id/arrive')
  markArrived(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    requirePatientFlowOperator(user);
    return this.appointments.markArrived(id, user.organizationId, user.locationId, user.id);
  }

  @Post(':id/cancel')
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(cancelAppointmentSchema)) body: CancelAppointmentInput,
  ) {
    requireSchedulingOperator(user);
    return this.appointments.cancel(id, user.organizationId, user.locationId, user.id, body.reason);
  }

  @Post(':id/no-show')
  markNoShow(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    requireRole(user, ['OWNER', 'PRACTICE_MANAGER', 'RECEPTIONIST']);
    return this.appointments.markNoShow(id, user.organizationId, user.locationId, user.id);
  }

  @Get(':id/history')
  history(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    requireRole(user, ['OWNER', 'PRACTICE_MANAGER', 'RECEPTIONIST', 'VETERINARIAN', 'TECHNICIAN', 'ASSISTANT']);
    return this.appointments.history(id, user.organizationId, user.locationId);
  }
}

function requireSchedulingOperator(user: AuthenticatedUser) {
  // Founder-approved SPA-44 policy: veterinarians can manage appointments.
  // Scheduler configuration and Admin settings retain their separate checks.
  requireRole(user, ['OWNER', 'PRACTICE_MANAGER', 'RECEPTIONIST', 'VETERINARIAN']);
}

function requirePatientFlowOperator(user: AuthenticatedUser) {
  requireRole(user, [
    'OWNER',
    'PRACTICE_MANAGER',
    'RECEPTIONIST',
    'VETERINARIAN',
    'TECHNICIAN',
    'ASSISTANT',
  ]);
}
