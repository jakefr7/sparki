import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CountsService } from './counts.service';
import {
  assignmentSchema,
  cancelCountSchema,
  countEntrySchema,
  createCountSchema,
  postCountSchema,
  recountSchema,
  reviewLineSchema,
  scannerQuerySchema,
  templateSchema,
  type AssignmentInput,
  type CancelCountInput,
  type CountEntryInput,
  type CountTemplateInput,
  type CreateCountInput,
  type PostCountInput,
  type RecountInput,
  type ReviewLineInput,
} from './dto/counts.schema';

@Controller('inventory')
export class CountsController {
  constructor(private readonly counts: CountsService) {}
  @Get('counts') list(@CurrentUser() user: AuthenticatedUser) {
    return this.counts.list(user);
  }
  @Post('counts') create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createCountSchema)) body: CreateCountInput,
  ) {
    return this.counts.create(user, body);
  }
  @Get('counts/:id') get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.counts.get(user, id);
  }
  @Post('counts/:id/begin') begin(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.counts.begin(user, id);
  }
  @Post('counts/:id/lines/:lineId/entries') enter(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @Body(new ZodValidationPipe(countEntrySchema)) body: CountEntryInput,
  ) {
    return this.counts.enter(user, id, lineId, body);
  }
  @Get('counts/:id/scan') scan(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query(new ZodValidationPipe(scannerQuerySchema)) query: { query: string },
  ) {
    return this.counts.scan(user, id, query.query);
  }
  @Post('counts/:id/submit') submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.counts.submit(user, id);
  }
  @Post('counts/:id/recount') recount(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(recountSchema)) body: RecountInput,
  ) {
    return this.counts.requestRecount(user, id, body);
  }
  @Post('counts/:id/lines/:lineId/review') reviewLine(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @Body(new ZodValidationPipe(reviewLineSchema)) body: ReviewLineInput,
  ) {
    return this.counts.reviewLine(user, id, lineId, body);
  }
  @Post('counts/:id/approve') approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.counts.approve(user, id);
  }
  @Post('counts/:id/post') post(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(postCountSchema)) body: PostCountInput,
  ) {
    return this.counts.post(user, id, body);
  }
  @Post('counts/:id/cancel') cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(cancelCountSchema)) body: CancelCountInput,
  ) {
    return this.counts.cancel(user, id, body);
  }
  @Post('counts/:id/assignments') assign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(assignmentSchema)) body: AssignmentInput,
  ) {
    return this.counts.assign(user, id, body);
  }
  @Get('count-templates') templates(@CurrentUser() user: AuthenticatedUser) {
    return this.counts.templates(user);
  }
  @Post('count-templates') createTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(templateSchema)) body: CountTemplateInput,
  ) {
    return this.counts.createTemplate(user, body);
  }
}
