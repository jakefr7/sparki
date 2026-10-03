import { Module } from '@nestjs/common';
import { MessagingModule } from '../messaging/messaging.module';
import { ClientCommunicationController } from './client-communication.controller';
import { ClientCommunicationDispatcher } from './client-communication-dispatcher.service';
import { ClientCommunicationInboundService } from './client-communication-inbound.service';
import { ClientCommunicationService } from './client-communication.service';
import { ClientCommunicationWebhookController } from './client-communication-webhook.controller';
import { ClientTextingConsentService } from './client-texting-consent.service';
import { ClientTextingReadinessService } from './client-texting-readiness.service';
import { InboundMediaDownloader } from './inbound-media-downloader';
import { AppointmentNotificationEngine } from './notifications/appointment-notification-engine.service';
import { AppointmentNotificationSettingsService } from './notifications/appointment-notification-settings.service';
import { AppointmentNotificationStatusService } from './notifications/appointment-notification-status.service';
import { AppointmentNotificationsController } from './notifications/appointment-notifications.controller';
import { TelnyxSmsProvider } from './providers/telnyx-sms.provider';

/**
 * Clinic <-> client texting. Separate from MessagingModule (staff chat) on
 * purpose: this one talks to the outside world and carries consent and
 * delivery truth. It only borrows MessagingModule's private file storage.
 */
@Module({
  imports: [MessagingModule],
  controllers: [
    ClientCommunicationController,
    ClientCommunicationWebhookController,
    AppointmentNotificationsController,
  ],
  providers: [
    ClientCommunicationService,
    ClientCommunicationDispatcher,
    ClientCommunicationInboundService,
    ClientTextingConsentService,
    ClientTextingReadinessService,
    TelnyxSmsProvider,
    InboundMediaDownloader,
    AppointmentNotificationEngine,
    AppointmentNotificationSettingsService,
    AppointmentNotificationStatusService,
  ],
})
export class ClientCommunicationModule {}
