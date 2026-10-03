import { BadRequestException, Controller, Headers, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../auth/public.decorator';
import { ClientCommunicationInboundService } from './client-communication-inbound.service';

/** Path main.ts registers a raw-body parser for. Keep the two in step. */
export const TELNYX_WEBHOOK_PATH = '/client-communication/webhooks/telnyx';

/**
 * Public by design: Telnyx's servers are the caller, so there is no Sparki
 * session. The route is protected by Telnyx's signature over the exact
 * request bytes (ClientCommunicationInboundService.handleTelnyxWebhook),
 * the same trust model as the Stripe webhook in BillingController.
 */
@Public()
@Controller('client-communication/webhooks')
export class ClientCommunicationWebhookController {
  constructor(private readonly inbound: ClientCommunicationInboundService) {}

  @Post('telnyx')
  @HttpCode(200)
  async telnyx(
    @Req() request: Request,
    @Headers('telnyx-signature-ed25519') signature?: string,
    @Headers('telnyx-timestamp') timestamp?: string,
  ) {
    if (!Buffer.isBuffer(request.body)) {
      throw new BadRequestException(
        'Expected raw request body for webhook signature verification.',
      );
    }
    await this.inbound.handleTelnyxWebhook(request.body, signature, timestamp);
    return { received: true };
  }
}
