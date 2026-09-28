import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { requireRole } from '../auth/require-role';
import type { AuthenticatedUser } from '../auth/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  changeRoleSchema,
  inviteMemberSchema,
  inviteMembersBatchSchema,
  type ChangeRoleInput,
  type InviteMemberInput,
  type InviteMembersBatchInput,
} from './dto/invite-member.schema';
import { TeamService } from './team.service';

/** Settings > Team. Every route requires OWNER or PRACTICE_MANAGER — see
 *  docs/blueprint/11-permission-and-ownership-v1.md role capabilities
 *  ("ADMIN": user management, no ownership transfer). TeamService enforces
 *  the further ownership-specific rules (only an OWNER may grant/touch
 *  OWNER, a clinic can never lose its last active owner). */
const TEAM_MANAGER_ROLES = ['OWNER', 'PRACTICE_MANAGER'] as const;

@Controller('team')
export class TeamController {
  constructor(private readonly team: TeamService) {}

  @Get('members')
  listMembers(@CurrentUser() user: AuthenticatedUser) {
    requireRole(user, [...TEAM_MANAGER_ROLES]);
    return this.team.listMembers(user.organizationId);
  }

  @Get('invitations')
  listInvitations(@CurrentUser() user: AuthenticatedUser) {
    requireRole(user, [...TEAM_MANAGER_ROLES]);
    return this.team.listInvitations(user.organizationId);
  }

  @Post('invitations')
  invite(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(inviteMemberSchema)) body: InviteMemberInput,
  ) {
    requireRole(user, [...TEAM_MANAGER_ROLES]);
    return this.team.invite(user, body.email, body.role);
  }

  @Post('invitations/batch')
  inviteBatch(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(inviteMembersBatchSchema)) body: InviteMembersBatchInput,
  ) {
    requireRole(user, [...TEAM_MANAGER_ROLES]);
    return this.team.inviteBatch(user, body.invitations);
  }

  @Post('invitations/:id/resend')
  resendInvitation(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    requireRole(user, [...TEAM_MANAGER_ROLES]);
    return this.team.resendInvitation(user, id);
  }

  @Delete('invitations/:id')
  revokeInvitation(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    requireRole(user, [...TEAM_MANAGER_ROLES]);
    return this.team.revokeInvitation(user, id);
  }

  @Patch('members/:id/role')
  changeRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(changeRoleSchema)) body: ChangeRoleInput,
  ) {
    requireRole(user, [...TEAM_MANAGER_ROLES]);
    return this.team.changeRole(user, id, body.role);
  }

  @Post('members/:id/disable')
  disable(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    requireRole(user, [...TEAM_MANAGER_ROLES]);
    return this.team.disable(user, id);
  }

  @Post('members/:id/enable')
  enable(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    requireRole(user, [...TEAM_MANAGER_ROLES]);
    return this.team.enable(user, id);
  }
}
