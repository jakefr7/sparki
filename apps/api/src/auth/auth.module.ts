import { Global, Module } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { AppConfigService } from '../config/app-config.service';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { DevelopmentAuthGuard } from './development-auth.guard';
import { DevelopmentUserService } from './development-user.service';

/**
 * Global: every route is behind a guard by default. Use @Public() to opt a
 * route out (see health.controller.ts) rather than wiring the guard
 * per-controller, so new routes are secure unless explicitly marked otherwise.
 *
 * The guard itself is chosen by whether WorkOS is configured: production
 * always requires it (and DevelopmentAuthGuard refuses to construct there
 * regardless), while local/test environments get the real AuthGuard as soon
 * as WORKOS_API_KEY/WORKOS_CLIENT_ID/WORKOS_COOKIE_PASSWORD are set, falling
 * back to DevelopmentAuthGuard's fake OWNER user otherwise so controllers
 * stay buildable without live WorkOS credentials.
 */
@Global()
@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    DevelopmentUserService,
    {
      provide: APP_GUARD,
      useFactory: (
        reflector: Reflector,
        config: AppConfigService,
        authService: AuthService,
        developmentUser: DevelopmentUserService,
      ) =>
        config.nodeEnv === 'production' || authService.isConfigured
          ? new AuthGuard(reflector, authService, config)
          : new DevelopmentAuthGuard(reflector, config, developmentUser, authService),
      inject: [Reflector, AppConfigService, AuthService, DevelopmentUserService],
    },
  ],
  exports: [AuthService],
})
export class AuthModule {}
