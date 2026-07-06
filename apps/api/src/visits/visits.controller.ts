import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { createVisitSchema, type CreateVisitInput } from './dto/create-visit.schema';
import { saveVisitIntakeSchema, type SaveVisitIntakeInput } from './dto/save-visit-intake.schema';
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
    return this.visits.start(id, user.organizationId, user.id);
  }

  @Put(':id/intake')
  saveIntake(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(saveVisitIntakeSchema)) body: SaveVisitIntakeInput,
  ) {
    return this.visits.saveIntake(id, user.organizationId, user.id, body);
  }

  @Post(':id/intake/complete')
  completeIntake(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.visits.completeIntake(id, user.organizationId, user.id);
  }
}
