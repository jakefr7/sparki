import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../auth/public.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { BillingService } from './billing.service';
import { BillingWebhookService } from './billing-webhook.service';
import { createCheckoutSessionSchema, type CreateCheckoutSessionInput } from './dto/create-checkout-session.schema';

/**
 * Entirely public/unauthenticated by design: checkout starts before any
 * Sparki account exists (docs/adr/ADR-007). The webhook route is the one
 * genuinely trust-sensitive route here — it is protected by Stripe
 * signature verification (BillingWebhookService.verifyAndProcess), not by
 * Sparki session auth, since Stripe's servers are the caller.
 */
@Public()
@Controller('billing')
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly webhook: BillingWebhookService,
  ) {}

  @Post('checkout-sessions')
  createCheckoutSession(
    @Body(new ZodValidationPipe(createCheckoutSessionSchema)) body: CreateCheckoutSessionInput,
  ) {
    return this.billing.createCheckoutSession(body);
  }

  @Get('checkout-sessions/:id/status')
  getCheckoutSessionStatus(@Param('id') id: string) {
    return this.billing.getCheckoutSessionStatus(id);
  }

  /** main.ts registers a raw-body parser scoped to exactly this path,
   *  before the app-wide JSON body parser — request.body is the untouched
   *  raw Buffer here, which Stripe signature verification requires. */
  @Post('webhook')
  async handleWebhook(@Req() request: Request, @Headers('stripe-signature') signature?: string) {
    if (!Buffer.isBuffer(request.body)) {
      throw new BadRequestException('Expected raw request body for webhook signature verification.');
    }
    await this.webhook.verifyAndProcess(request.body, signature);
    return { received: true };
  }
}
