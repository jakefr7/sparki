import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AppConfigService } from '../config/app-config.service';
import { DevelopmentUserService } from './development-user.service';
import { IS_PUBLIC_KEY } from './public.decorator';
import type { AuthenticatedUser } from './types';

/**
 * Stands in for AuthGuard outside production so every route can be built and
 * tested exactly as it will run once WorkOS integration lands (real
 * organization/location/role context on request.user), without needing live
 * WorkOS credentials. See docs/engineering/00-engineering-plan.md.
 *
 * @Public() routes are still respected: a public route gets no request.user
 * either way, matching production behavior.
 */
@Injectable()
export class DevelopmentAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    config: AppConfigService,
    private readonly developmentUser: DevelopmentUserService,
  ) {
    if (config.nodeEnv === 'production') {
      throw new Error('DevelopmentAuthGuard must never be used when NODE_ENV=production');
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    request.user = await this.developmentUser.getUser();
    return true;
  }
}
