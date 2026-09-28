import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { json, raw } from 'express';
import { AppModule } from './app.module';
import { AppConfigService } from './config/app-config.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const config = app.get(AppConfigService);

  // Stripe webhook signature verification needs the exact raw request bytes
  // (see BillingWebhookService.verifyAndProcess) — registered before the
  // app-wide JSON parser below so this path's body is never parsed to JSON.
  app.use('/billing/webhook', raw({ type: 'application/json' }));

  // A 25 MB clinical attachment expands to roughly 33.4 MB as base64.
  app.use(json({ limit: '35mb' }));

  app.enableCors({ origin: config.corsOrigin });
  app.enableShutdownHooks();

  await app.listen(config.port);
  new Logger('Bootstrap').log(`Listening on http://localhost:${config.port}`);
}

void bootstrap();
