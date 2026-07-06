import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { createPatientSchema, type CreatePatientInput } from './dto/create-patient.schema';
import { searchPatientsQuerySchema, type SearchPatientsQuery } from './dto/search-patients.schema';
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

  @Get(':id')
  findById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.patients.findById(id, user.organizationId);
  }

  @Get(':id/workspace')
  getWorkspaceSummary(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.patients.getWorkspaceSummary(id, user.organizationId);
  }
}
