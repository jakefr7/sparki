import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { createPatientSchema, type CreatePatientInput } from './dto/create-patient.schema';
import { listPatientsQuerySchema, type ListPatientsQuery } from './dto/list-patients.schema';
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

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updatePatientSchema)) body: UpdatePatientInput,
  ) {
    return this.patients.update(id, user.organizationId, body);
  }
}
