import { Global, Module } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { AppConfigService } from '../config/app-config.service';
import { EmailModule } from '../email/email.module';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { DevelopmentAuthGuard } from './development-auth.guard';
import { DevelopmentUserService } from './development-user.service';
import { SubscriptionGuard } from './subscription.guard';

/**
 * Global: every route is behind a guard by default. Use @Public() to opt a
 * route out (see health.controller.ts) rather than wiring the guard
 * per-controller, so new routes are secure unless explicitly marked otherwise.
 *
 * DevelopmentAuthGuard is selected only through the explicit fixed-identity
 * mode. Missing WorkOS configuration never grants an identity implicitly.
 *
 * SubscriptionGuard runs second — NestJS applies multiple APP_GUARD
 * providers in registration order — so it always sees a resolved
 * request.user from whichever identity guard ran first. See
 * docs/adr/ADR-007 for why this is a second guard rather than folded into
 * the identity guard: authentication and billing-gating are different
 * questions with different failure modes (401 vs 402) and different
 * @Public()/@AllowInactiveClinic() opt-outs.
 */
@Global()
@Module({
  imports: [EmailModule],
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
    {
      provide: APP_GUARD,
      useClass: SubscriptionGuard,
    },
  ],
  exports: [AuthService],
})
export class AuthModule {}
