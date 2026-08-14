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
 * DevelopmentAuthGuard is selected only through the explicit fixed-identity
 * mode. Missing WorkOS configuration never grants an identity implicitly.
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
        config.developmentAuthMode === 'fixed'
          ? new DevelopmentAuthGuard(reflector, config, developmentUser, authService)
          : new AuthGuard(reflector, authService, config),
      inject: [Reflector, AppConfigService, AuthService, DevelopmentUserService],
    },
  ],
  exports: [AuthService],
})
export class AuthModule {}
