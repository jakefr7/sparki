import { Body, Controller, Get, Header, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  releaseReservationSchema,
  reservationSchema,
  usageMappingSchema,
  usagePostSchema,
  usageRetrySchema,
  usageReversalSchema,
  type ReleaseReservationInput,
  type ReservationInput,
  type UsageMappingInput,
  type UsagePostInput,
  type UsageRetryInput,
  type UsageReversalInput,
} from './dto/usage.schema';
import { UsageService } from './usage.service';

@Controller('inventory/usage')
export class UsageController {
  constructor(private readonly usage: UsageService) {}

  @Get('metrics')
  metrics(@CurrentUser() user: AuthenticatedUser) {
    return this.usage.metrics(user);
  }

  @Get('mappings')
  mappings(@CurrentUser() user: AuthenticatedUser) {
    return this.usage.mappings(user);
  }

  @Post('mappings')
  createMapping(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(usageMappingSchema)) body: UsageMappingInput,
  ) {
    return this.usage.createMapping(user, body);
  }

  @Post('mappings/:id/archive')
  archiveMapping(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.usage.archiveMapping(user, id);
  }

  @Post('mappings/:id/duplicate')
  duplicateMapping(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.usage.duplicateMapping(user, id);
  }

  @Post('mappings/:id/test')
  testMapping(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: Record<string, string>,
  ) {
    return this.usage.testMapping(user, id, body);
  }

  @Get('reservations')
  reservations(@CurrentUser() user: AuthenticatedUser) {
    return this.usage.reservations(user);
  }

  @Post('reservations')
  reserve(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(reservationSchema)) body: ReservationInput,
  ) {
    return this.usage.createReservation(user, body);
  }

  @Post('reservations/:id/release')
  release(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(releaseReservationSchema)) body: ReleaseReservationInput,
  ) {
    return this.usage.releaseReservation(user, id, body);
  }

  @Get('events')
  events(@CurrentUser() user: AuthenticatedUser, @Query('status') status?: string) {
    return this.usage.usageEvents(user, status);
  }

  @Post('events')
  postUsage(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(usagePostSchema)) body: UsagePostInput,
  ) {
    return this.usage.postUsage(user, body);
  }

  @Post('events/:id/retry')
  retry(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(usageRetrySchema)) body: UsageRetryInput,
  ) {
    return this.usage.retryUsage(user, id, body);
  }

  @Post('events/:id/reverse')
  reverse(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(usageReversalSchema)) body: UsageReversalInput,
  ) {
    return this.usage.reverseUsage(user, id, body);
  }

  @Get('patients/:patientId/trace')
  patientTrace(@CurrentUser() user: AuthenticatedUser, @Param('patientId') patientId: string) {
    return this.usage.patientTrace(user, patientId);
  }

  @Get('lots/:lotId/trace')
  lotTrace(@CurrentUser() user: AuthenticatedUser, @Param('lotId') lotId: string) {
    return this.usage.lotTrace(user, lotId);
  }

  @Get('lots/:lotId/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="affected-patients.csv"')
  exportLotTrace(@CurrentUser() user: AuthenticatedUser, @Param('lotId') lotId: string) {
    return this.usage.exportLotTrace(user, lotId);
  }
}
