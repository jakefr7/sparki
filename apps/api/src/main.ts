import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { json } from 'express';
import { AppModule } from './app.module';
import { AppConfigService } from './config/app-config.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const config = app.get(AppConfigService);

  app.use(json({ limit: '15mb' }));

  app.enableCors({ origin: config.corsOrigin });
  app.enableShutdownHooks();

  await app.listen(config.port);
  new Logger('Bootstrap').log(`Listening on http://localhost:${config.port}`);
}

void bootstrap();
