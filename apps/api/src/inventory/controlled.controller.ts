import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ControlledService } from './controlled.service';
import {
  authorizationSchema,
  controlledEventSchema,
  discrepancySchema,
  profileSchema,
  registrationSchema,
  reportStatusSchema,
  transferControlledSchema,
  type AuthorizationInput,
  type ControlledEventInput,
  type ControlledTransferInput,
  type DiscrepancyInput,
  type ProfileInput,
  type RegistrationInput,
  type ReportStatusInput,
} from './dto/controlled.schema';
@Controller('inventory/controlled')
export class ControlledController {
  constructor(private readonly controlled: ControlledService) {}
  @Get('overview') overview(@CurrentUser() u: AuthenticatedUser) {
    return this.controlled.overview(u);
  }
  @Get('registrations') registrations(@CurrentUser() u: AuthenticatedUser) {
    return this.controlled.registrations(u);
  }
  @Post('registrations') createRegistration(
    @CurrentUser() u: AuthenticatedUser,
    @Body(new ZodValidationPipe(registrationSchema)) b: RegistrationInput,
  ) {
    return this.controlled.createRegistration(u, b);
  }
  @Post('registrations/:id/authorizations') grant(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(authorizationSchema)) b: AuthorizationInput,
  ) {
    return this.controlled.grant(u, id, b);
  }
  @Get('profiles') profiles(@CurrentUser() u: AuthenticatedUser) {
    return this.controlled.profiles(u);
  }
  @Post('profiles') createProfile(
    @CurrentUser() u: AuthenticatedUser,
    @Body(new ZodValidationPipe(profileSchema)) b: ProfileInput,
  ) {
    return this.controlled.createProfile(u, b);
  }
  @Get('ledger') ledger(@CurrentUser() u: AuthenticatedUser) {
    return this.controlled.ledger(u);
  }
  @Post('ledger') post(
    @CurrentUser() u: AuthenticatedUser,
    @Body(new ZodValidationPipe(controlledEventSchema)) b: ControlledEventInput,
  ) {
    return this.controlled.postEvent(u, b);
  }
  @Post('transfers') transfer(
    @CurrentUser() u: AuthenticatedUser,
    @Body(new ZodValidationPipe(transferControlledSchema)) b: ControlledTransferInput,
  ) {
    return this.controlled.transfer(u, b);
  }
  @Get('discrepancies') discrepancies(@CurrentUser() u: AuthenticatedUser) {
    return this.controlled.discrepancies(u);
  }
  @Post('discrepancies') createDiscrepancy(
    @CurrentUser() u: AuthenticatedUser,
    @Body(new ZodValidationPipe(discrepancySchema)) b: DiscrepancyInput,
  ) {
    return this.controlled.createDiscrepancy(u, b);
  }
  @Get('reports') reports(@CurrentUser() u: AuthenticatedUser) {
    return this.controlled.reports(u);
  }
  @Post('reports/:id/status') updateReport(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(reportStatusSchema)) b: ReportStatusInput,
  ) {
    return this.controlled.updateReport(u, id, b);
  }
}
