import { Body, Controller, Get, Param, Patch, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { createPatientSchema, type CreatePatientInput } from './dto/create-patient.schema';
import { listPatientsQuerySchema, type ListPatientsQuery } from './dto/list-patients.schema';
import {
  createPatientAlertSchema,
  type CreatePatientAlertInput,
  updatePatientAlertSchema,
  type UpdatePatientAlertInput,
} from './dto/patient-alert.schema';
import {
  createPatientMedicationSchema,
  type CreatePatientMedicationInput,
  discontinuePatientMedicationSchema,
  type DiscontinuePatientMedicationInput,
  flagMedicationReactionSchema,
  type FlagMedicationReactionInput,
  updatePatientMedicationSchema,
  type UpdatePatientMedicationInput,
} from './dto/patient-medication.schema';
import { uploadPatientPhotoSchema, type UploadPatientPhotoInput } from './dto/patient-photo.schema';
import { searchPatientsQuerySchema, type SearchPatientsQuery } from './dto/search-patients.schema';
import { updatePatientSchema, type UpdatePatientInput } from './dto/update-patient.schema';
import { PatientsService } from './patients.service';

@Controller('patients')
export class PatientsController {
  constructor(private readonly patients: PatientsService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createPatientSchema)) body: CreatePatientInput,
  ) {
    return this.patients.create(user.organizationId, body);
  }

  // Must come before ':id' so it isn't matched as a patient ID.
  @Get('search')
  search(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(searchPatientsQuerySchema)) query: SearchPatientsQuery,
  ) {
    return this.patients.search(user.organizationId, query.query, query.limit);
  }

  // Must come before ':id' so it isn't matched as a patient ID. Plain
  // directory listing — what the Patients tab shows before a search query.
  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(listPatientsQuerySchema)) query: ListPatientsQuery,
  ) {
    return this.patients.list(user.organizationId, query.limit);
  }

  @Get(':id')
  findById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.patients.findById(id, user.organizationId);
  }

  @Get(':id/workspace')
  getWorkspaceSummary(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.patients.getWorkspaceSummary(id, user.organizationId, user.locationId, this.canManageMedications(user));
  }

  @Post(':id/alerts')
  createAlert(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createPatientAlertSchema)) body: CreatePatientAlertInput,
  ) {
    return this.patients.createAlert(id, user.organizationId, body);
  }

  @Patch(':id/alerts/:alertId')
  updateAlert(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('alertId') alertId: string,
    @Body(new ZodValidationPipe(updatePatientAlertSchema)) body: UpdatePatientAlertInput,
  ) {
    return this.patients.updateAlert(id, alertId, user.organizationId, body);
  }

  @Post(':id/medications')
  createMedication(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createPatientMedicationSchema)) body: CreatePatientMedicationInput,
  ) {
    return this.patients.createMedication(id, user, body);
  }

  @Patch(':id/medications/:medicationId')
  updateMedication(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('medicationId') medicationId: string,
    @Body(new ZodValidationPipe(updatePatientMedicationSchema)) body: UpdatePatientMedicationInput,
  ) {
    return this.patients.updateMedication(id, medicationId, user, body);
  }

  @Post(':id/medications/:medicationId/refill')
  refillMedication(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Param('medicationId') medicationId: string) {
    return this.patients.refillMedication(id, medicationId, user);
  }

  @Post(':id/medications/:medicationId/discontinue')
  discontinueMedication(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('medicationId') medicationId: string,
    @Body(new ZodValidationPipe(discontinuePatientMedicationSchema)) body: DiscontinuePatientMedicationInput,
  ) {
    return this.patients.discontinueMedication(id, medicationId, user, body.reason);
  }

  @Post(':id/medications/:medicationId/reaction')
  flagMedicationReaction(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('medicationId') medicationId: string,
    @Body(new ZodValidationPipe(flagMedicationReactionSchema)) body: FlagMedicationReactionInput,
  ) {
    return this.patients.flagMedicationReaction(id, medicationId, user, body.reaction);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updatePatientSchema)) body: UpdatePatientInput,
  ) {
    return this.patients.update(id, user.organizationId, body);
  }

  @Post(':id/photo')
  uploadPhoto(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(uploadPatientPhotoSchema)) body: UploadPatientPhotoInput,
  ) {
    return this.patients.uploadPhoto(user.organizationId, id, body);
  }

  @Get(':id/photo/content')
  async getPhoto(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Res() response: Response) {
    const file = await this.patients.getPhoto(user.organizationId, id);
    response.setHeader('Content-Type', file.contentType);
    response.setHeader('Content-Length', String(file.body.length));
    response.send(file.body);
  }

  private canManageMedications(user: AuthenticatedUser) {
    return Boolean(user.canManageMedications || ['OWNER', 'VETERINARIAN', 'TECHNICIAN'].includes(user.role));
  }
}
