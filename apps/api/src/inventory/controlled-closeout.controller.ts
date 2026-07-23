import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ControlledCloseoutService } from './controlled-closeout.service';
import {
  controlledCountEntrySchema,
  controlledPostSchema,
  controlledReviewSchema,
  correctionDecisionSchema,
  correctionSchema,
  createControlledCountSchema,
  disposalActionSchema,
  disposalSchema,
  reportQuerySchema,
  revokeAuthorizationSchema,
  type ControlledCountEntry,
  type ControlledPost,
  type ControlledReview,
  type CorrectionDecision,
  type CorrectionInput,
  type CreateControlledCount,
  type DisposalAction,
  type DisposalInput,
  type ReportQuery,
} from './dto/controlled-closeout.schema';
@Controller('inventory/controlled')
export class ControlledCloseoutController {
  constructor(private readonly service: ControlledCloseoutService) {}
  @Get('counts') counts(@CurrentUser() u: AuthenticatedUser) {
    return this.service.counts(u);
  }
  @Post('counts') createCount(
    @CurrentUser() u: AuthenticatedUser,
    @Body(new ZodValidationPipe(createControlledCountSchema)) b: CreateControlledCount,
  ) {
    return this.service.createCount(u, b);
  }
  @Get('counts/:id') count(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    return this.service.getCount(u, id);
  }
  @Post('counts/:id/lines/:lineId/entries') entry(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @Body(new ZodValidationPipe(controlledCountEntrySchema)) b: ControlledCountEntry,
  ) {
    return this.service.enterCount(u, id, lineId, b);
  }
  @Post('counts/:id/submit') submit(@CurrentUser() u: AuthenticatedUser, @Param('id') id: string) {
    return this.service.submitCount(u, id);
  }
  @Post('counts/:id/reviews') review(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(controlledReviewSchema)) b: ControlledReview,
  ) {
    return this.service.reviewCount(u, id, b);
  }
  @Post('counts/:id/post') postCount(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(controlledPostSchema)) b: ControlledPost,
  ) {
    return this.service.postCount(u, id, b);
  }
  @Get('corrections') corrections(@CurrentUser() u: AuthenticatedUser) {
    return this.service.corrections(u);
  }
  @Post('corrections') propose(
    @CurrentUser() u: AuthenticatedUser,
    @Body(new ZodValidationPipe(correctionSchema)) b: CorrectionInput,
  ) {
    return this.service.proposeCorrection(u, b);
  }
  @Post('corrections/:id/decision') decide(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(correctionDecisionSchema)) b: CorrectionDecision,
  ) {
    return this.service.decideCorrection(u, id, b);
  }
  @Post('corrections/:id/post') postCorrection(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(controlledPostSchema)) b: ControlledPost,
  ) {
    return this.service.postCorrection(u, id, b);
  }
  @Get('disposals') disposals(@CurrentUser() u: AuthenticatedUser) {
    return this.service.disposals(u);
  }
  @Post('disposals') createDisposal(
    @CurrentUser() u: AuthenticatedUser,
    @Body(new ZodValidationPipe(disposalSchema)) b: DisposalInput,
  ) {
    return this.service.createDisposal(u, b);
  }
  @Post('disposals/:id/action') actDisposal(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(disposalActionSchema)) b: DisposalAction,
  ) {
    return this.service.actDisposal(u, id, b);
  }
  @Get('authorizations') authorizations(@CurrentUser() u: AuthenticatedUser) {
    return this.service.authorizations(u);
  }
  @Post('authorizations/:id/revoke') revoke(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(revokeAuthorizationSchema))
    b: { reason: string; attestation: string },
  ) {
    return this.service.revokeAuthorization(u, id, b.reason);
  }
  @Get('exports') async report(
    @CurrentUser() u: AuthenticatedUser,
    @Query(new ZodValidationPipe(reportQuerySchema)) q: ReportQuery,
    @Res() res: Response,
  ) {
    const out = await this.service.exportReport(u, q);
    res.setHeader('Content-Type', out.mime);
    res.setHeader('Content-Disposition', `attachment; filename="${out.filename}"`);
    res.send(out.body);
  }
}
