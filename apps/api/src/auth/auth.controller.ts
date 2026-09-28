import { Body, Controller, Get, Patch, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppConfigService } from '../config/app-config.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { loginSchema, type LoginInput } from './dto/login.schema';
import { updateProfileSchema, type UpdateProfileInput } from './dto/update-profile.schema';
import { AllowInactiveClinic } from './allow-inactive-clinic.decorator';
import { MANAGE_ADMIN_SETTINGS } from './permissions';
import { Public } from './public.decorator';
import { ROLE_PERMISSIONS } from './role-permissions';
import { clearSessionCookie, readSessionCookie, setSessionCookie } from './session-cookie';
import type { AuthenticatedUser } from './types';

const MANAGE_MEDICATIONS = 'medications:manage';

function toMeResponse(user: AuthenticatedUser) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    // MANAGE_ADMIN_SETTINGS is a per-user grant, not role-derived — appended
    // here rather than living in ROLE_PERMISSIONS (see role-permissions.ts).
    permissions: [
      ...ROLE_PERMISSIONS[user.role],
      ...(user.canManageAdminSettings ? [MANAGE_ADMIN_SETTINGS] : []),
      ...(user.canManageMedications || ['OWNER', 'VETERINARIAN', 'TECHNICIAN'].includes(user.role) ? [MANAGE_MEDICATIONS] : []),
    ],
  };
}

// A user whose clinic's subscription has lapsed must still be able to see
// who they are and sign out — the frontend needs /auth/me to render the
// restricted-access screen at all.
@AllowInactiveClinic()
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

  @Get('profile')
  profile(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.getProfile(user.id);
  }

  @Patch('profile')
  updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateProfileSchema)) body: UpdateProfileInput,
  ) {
    return this.auth.updateProfile(user.id, body);
  }
}
