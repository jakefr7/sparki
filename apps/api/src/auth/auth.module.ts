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
import { TenantContextGuard } from './tenant-context.guard';
import { ProfileAvatarController } from './profile-avatar.controller';
import { ProfileAvatarService } from './profile-avatar.service';
import { AttachmentStorageService } from '../messaging/attachment-storage.service';

/**
 * Global: every route is behind a guard by default. Use @Public() to opt a
 * route out (see health.controller.ts) rather than wiring the guard
 * per-controller, so new routes are secure unless explicitly marked otherwise.
 *
 * DevelopmentAuthGuard is selected only through the explicit fixed-identity
 * mode. Missing WorkOS configuration never grants an identity implicitly.
 *
 * SubscriptionGuard and TenantContextGuard run after the identity guard —
 * NestJS applies multiple APP_GUARD providers in registration order — so
 * they always see a resolved request.user from whichever identity guard ran
 * first. See docs/adr/ADR-007 for why SubscriptionGuard is a second guard
 * rather than folded into the identity guard: authentication and
 * billing-gating are different questions with different failure modes (401
 * vs 402) and different @Public()/@AllowInactiveClinic() opt-outs.
 *
 * TenantContextGuard runs third, for the same reason: it only needs a
 * resolved request.user, and binds it to the TenantContext that
 * @sparki/db's tenant-scoping Prisma extension reads (see
 * packages/db/src/tenant-scoping.ts).
 */
@Global()
@Module({
  imports: [EmailModule],
  controllers: [AuthController, ProfileAvatarController],
  providers: [
    ProfileAvatarService,
    AttachmentStorageService,
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
    {
      provide: APP_GUARD,
      useClass: TenantContextGuard,
    },
  ],
  exports: [AuthService],
})
export class AuthModule {}
