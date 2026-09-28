import { Body, Controller, Get, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AppConfigService } from '../config/app-config.service';
import { Public } from '../auth/public.decorator';
import { setSessionCookie } from '../auth/session-cookie';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { acceptInvitationSchema, type AcceptInvitationInput } from './dto/accept-invitation.schema';
import { InvitationsService } from './invitations.service';

/**
 * Public, token-scoped routes only — no authenticated session required or
 * assumed. Authenticated team-management routes (list/invite/resend/revoke)
 * live in TeamController, which calls into the same InvitationsService.
 */
@Public()
@Controller('invitations')
export class InvitationsController {
  constructor(
    private readonly invitations: InvitationsService,
    private readonly config: AppConfigService,
  ) {}

  @Get(':token')
  inspect(@Param('token') token: string) {
    return this.invitations.inspect(token);
  }

  @Post(':token/accept')
  async accept(
    @Param('token') token: string,
    @Body(new ZodValidationPipe(acceptInvitationSchema)) body: AcceptInvitationInput,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { sealedSession, user } = await this.invitations.accept(token, body);
    setSessionCookie(response, sealedSession, this.config.nodeEnv === 'production');
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }
}
