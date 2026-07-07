import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppConfigService } from '../config/app-config.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { loginSchema, type LoginInput } from './dto/login.schema';
import { Public } from './public.decorator';
import { ROLE_PERMISSIONS } from './role-permissions';
import { clearSessionCookie, readSessionCookie, setSessionCookie } from './session-cookie';
import type { AuthenticatedUser } from './types';

function toMeResponse(user: AuthenticatedUser) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    permissions: ROLE_PERMISSIONS[user.role],
  };
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: AppConfigService,
  ) {}

  @Public()
  @Post('login')
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { sealedSession, user } = await this.auth.login(body.email, body.password);
    setSessionCookie(response, sealedSession, this.config.nodeEnv === 'production');
    return { user: toMeResponse(user) };
  }

  @Public()
  @Post('logout')
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.auth.logout(readSessionCookie(request));
    clearSessionCookie(response, this.config.nodeEnv === 'production');
    return { ok: true };
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return { user: toMeResponse(user) };
  }
}
