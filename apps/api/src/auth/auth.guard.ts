import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { IS_PUBLIC_KEY } from './public.decorator';
import { AuthService } from './auth.service';
import { AppConfigService } from '../config/app-config.service';
import { readSessionCookie, setSessionCookie } from './session-cookie';
import type { AuthenticatedUser } from './types';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
    private readonly config: AppConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const sealedSession = readSessionCookie(request);
    if (!sealedSession) {
      throw new UnauthorizedException('Not authenticated');
    }

    const { user, refreshedSealedSession } = await this.authService.verifySession(sealedSession);

    if (refreshedSealedSession) {
      const response = context.switchToHttp().getResponse<Response>();
      setSessionCookie(response, refreshedSealedSession, this.config.nodeEnv === 'production');
    }

    request.user = user;
    return true;
  }
}
