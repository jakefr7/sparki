import { Module } from '@nestjs/common';
import { InvitationsModule } from '../invitations/invitations.module';
import { EmailModule } from '../email/email.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { BillingWebhookService } from './billing-webhook.service';
import { stripeClientProvider } from './stripe-client.provider';

@Module({
  imports: [InvitationsModule, EmailModule],
  controllers: [BillingController],
  providers: [BillingService, BillingWebhookService, stripeClientProvider],
})
export class BillingModule {}
