import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  createPatientFasSchema,
  listPatientFasSchema,
  type CreatePatientFasInput,
} from './dto/patient-fas.schema';
import { PatientFasService } from './patient-fas.service';

@Controller()
export class PatientFasController {
  constructor(private readonly fas: PatientFasService) {}
  @Get('patients/:id/fas')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query(new ZodValidationPipe(listPatientFasSchema)) query: { cursor?: string },
  ) {
    return this.fas.list(id, user, query.cursor);
  }
  @Post('visits/:id/fas')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createPatientFasSchema)) body: CreatePatientFasInput,
  ) {
    return this.fas.create(id, user, body);
  }
}
