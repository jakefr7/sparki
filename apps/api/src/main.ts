import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppConfigService } from './config/app-config.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(AppConfigService);

  app.enableCors({ origin: config.corsOrigin });
  app.enableShutdownHooks();

  await app.listen(config.port);
  console.log(`[api] listening on http://localhost:${config.port}`);
}

void bootstrap();
