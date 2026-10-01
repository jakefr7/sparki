import { BadRequestException, Body, Controller, Get, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PatientPrescriptionsService, prescriptionActionSchema, prescriptionDraftSchema } from './patient-prescriptions.service';

@Controller('patients/:patientId/prescriptions')
export class PatientPrescriptionsController {
  constructor(private readonly prescriptions: PatientPrescriptionsService) {}
  @Get() list(@CurrentUser() user: AuthenticatedUser, @Param('patientId') patientId: string) { return this.prescriptions.list(user, patientId); }
  @Post() create(@CurrentUser() user: AuthenticatedUser, @Param('patientId') patientId: string, @Body(new ZodValidationPipe(prescriptionDraftSchema)) input: z.infer<typeof prescriptionDraftSchema>) { return this.prescriptions.create(user, patientId, input); }
  @Post(':id/:action') action(@CurrentUser() user: AuthenticatedUser, @Param('patientId') patientId: string, @Param('id') id: string, @Param('action') action: string, @Body(new ZodValidationPipe(prescriptionActionSchema)) input: z.infer<typeof prescriptionActionSchema>) {
    if (action !== 'authorize' && action !== 'cancel') throw new BadRequestException('Unknown prescription action.');
    return this.prescriptions.action(user, patientId, id, action, input);
  }
  @Get(':id/pdf') async download(@CurrentUser() user: AuthenticatedUser, @Param('patientId') patientId: string, @Param('id') id: string, @Res() response: Response) {
    const body = await this.prescriptions.pdf(user, patientId, id);
    response.setHeader('Content-Type', 'application/pdf'); response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(`prescription-${id}.pdf`)}`); response.send(body);
  }
}
