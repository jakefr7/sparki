import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
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
  updatePatientMedicationSchema,
  type UpdatePatientMedicationInput,
} from './dto/patient-medication.schema';
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
    return this.patients.getWorkspaceSummary(id, user.organizationId);
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
    return this.patients.createMedication(id, user.organizationId, body);
  }

  @Patch(':id/medications/:medicationId')
  updateMedication(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('medicationId') medicationId: string,
    @Body(new ZodValidationPipe(updatePatientMedicationSchema)) body: UpdatePatientMedicationInput,
  ) {
    return this.patients.updateMedication(id, medicationId, user.organizationId, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updatePatientSchema)) body: UpdatePatientInput,
  ) {
    return this.patients.update(id, user.organizationId, body);
  }
}
