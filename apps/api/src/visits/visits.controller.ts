import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { requireRole } from '../auth/require-role';
import type { AuthenticatedUser } from '../auth/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { createVisitSchema, type CreateVisitInput } from './dto/create-visit.schema';
import { saveExamFindingsSchema, type SaveExamFindingsInput } from './dto/save-exam-findings.schema';
import { saveVisitIntakeSchema, type SaveVisitIntakeInput } from './dto/save-visit-intake.schema';
import { setDashboardStatusSchema, type SetDashboardStatusInput } from './dto/set-dashboard-status.schema';
import { VisitsService } from './visits.service';

@Controller('visits')
export class VisitsController {
  constructor(private readonly visits: VisitsService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createVisitSchema)) body: CreateVisitInput,
  ) {
    return this.visits.create(user.organizationId, user.locationId, user.id, body);
  }

  @Get(':id')
  findById(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.visits.findById(id, user.organizationId);
  }

  @Post(':id/start')
  start(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    requireRole(user, ['TECHNICIAN', 'ASSISTANT']);
    return this.visits.start(id, user.organizationId, user.id);
  }

  @Post(':id/dashboard-status')
  setDashboardStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(setDashboardStatusSchema)) body: SetDashboardStatusInput,
  ) {
    return this.visits.setDashboardStatus(id, user.organizationId, user.id, body.statusKey);
  }

  @Put(':id/intake')
  saveIntake(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(saveVisitIntakeSchema)) body: SaveVisitIntakeInput,
  ) {
    requireRole(user, ['TECHNICIAN', 'ASSISTANT']);
    return this.visits.saveIntake(id, user.organizationId, user.id, body);
  }

  @Post(':id/intake/complete')
  completeIntake(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    requireRole(user, ['TECHNICIAN', 'ASSISTANT']);
    return this.visits.completeIntake(id, user.organizationId, user.id);
  }

  @Post(':id/exam/start')
  startExam(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.visits.startExam(id, user.organizationId, user.id);
  }

  @Put(':id/exam-findings')
  saveExamFindings(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(saveExamFindingsSchema)) body: SaveExamFindingsInput,
  ) {
    return this.visits.saveExamFindings(id, user.organizationId, user.id, body);
  }

  // Clinical exam completion is veterinarian-owned per
  // docs/blueprint/11-permission-and-ownership-v1.md ("Veterinarian owns
  // Clinical Decisions... Medical Record content requires clinical
  // accountability"); OWNER retains it as the highest-access role.
  @Post(':id/exam/complete')
  completeExam(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    requireRole(user, ['VETERINARIAN', 'OWNER']);
    return this.visits.completeExam(id, user.organizationId, user.id);
  }
}
