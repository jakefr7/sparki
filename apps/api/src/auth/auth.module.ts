import { Global, Module } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { AppConfigService } from '../config/app-config.service';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { DevelopmentAuthGuard } from './development-auth.guard';
import { DevelopmentUserService } from './development-user.service';

/**
 * Global: every route is behind a guard by default. Use @Public() to opt a
 * route out (see health.controller.ts) rather than wiring the guard
 * per-controller, so new routes are secure unless explicitly marked otherwise.
 *
 * The guard itself is chosen per environment: production always gets the
 * real AuthGuard/AuthService (WorkOS), everything else gets
 * DevelopmentAuthGuard so controllers can be built and tested against
 * request.user exactly as they'll behave once WorkOS integration lands.
 */
@Global()
@Module({
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
        config.nodeEnv === 'production'
          ? new AuthGuard(reflector, authService)
          : new DevelopmentAuthGuard(reflector, config, developmentUser),
      inject: [Reflector, AppConfigService, AuthService, DevelopmentUserService],
    },
  ],
  exports: [AuthService],
})
export class AuthModule {}
