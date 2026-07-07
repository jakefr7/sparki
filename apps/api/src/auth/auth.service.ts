import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { WorkOS } from '@workos-inc/node';
import { prisma, type User } from '@sparki/db';
import { AppConfigService } from '../config/app-config.service';
import type { AuthenticatedUser } from './types';

const DEVELOPMENT_LOGIN_PASSWORD = 'SparkiTest123!';
const DEVELOPMENT_SESSION_PREFIX = 'dev:';

export interface LoginResult {
  sealedSession: string;
  user: AuthenticatedUser;
}

export interface SessionResult {
  user: AuthenticatedUser;
  /** Set when the access token was expired and refreshed mid-request; the
   *  guard must re-issue the session cookie with this value. */
  refreshedSealedSession?: string;
}

/**
 * WorkOS AuthKit owns authentication (credentials, password storage,
 * sessions); Sparki's own User/StaffProfile own authorization (role,
 * clinic membership, active status). See prisma/schema.prisma User model
 * and docs/blueprint/11-permission-and-ownership-v1.md.
 */
@Injectable()
export class AuthService {
  private readonly workos: WorkOS | null;
  private readonly clientId: string | undefined;
  private readonly cookiePassword: string | undefined;

  constructor(private readonly config: AppConfigService) {
    const { apiKey, clientId, cookiePassword } = this.config.workos;
    this.workos = apiKey ? new WorkOS(apiKey) : null;
    this.clientId = clientId;
    this.cookiePassword = cookiePassword;

    // Fail at boot, not at request time: a production deploy with WorkOS
    // misconfigured should never come up and start 503-ing every request.
    if (this.config.nodeEnv === 'production' && !this.isConfigured) {
      throw new Error(
        'WorkOS AuthKit is not configured (WORKOS_API_KEY / WORKOS_CLIENT_ID / WORKOS_COOKIE_PASSWORD) and NODE_ENV=production — refusing to start.',
      );
    }
  }

  get isConfigured(): boolean {
    return Boolean(this.workos && this.clientId && this.cookiePassword);
  }

  private requireConfigured(): { workos: WorkOS; clientId: string; cookiePassword: string } {
    if (!this.workos || !this.clientId || !this.cookiePassword) {
      throw new ServiceUnavailableException(
        'WorkOS AuthKit is not configured. Set WORKOS_API_KEY, WORKOS_CLIENT_ID, and WORKOS_COOKIE_PASSWORD to enable authentication.',
      );
    }
    return { workos: this.workos, clientId: this.clientId, cookiePassword: this.cookiePassword };
  }

  async login(email: string, password: string): Promise<LoginResult> {
    if (!this.isConfigured && this.config.nodeEnv !== 'production') {
      return this.loginDevelopmentUser(email, password);
    }

    const { workos, clientId, cookiePassword } = this.requireConfigured();

    let authResponse;
    try {
      authResponse = await workos.userManagement.authenticateWithPassword({
        clientId,
        email,
        password,
        session: { sealSession: true, cookiePassword },
      });
    } catch {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!authResponse.sealedSession) {
      throw new ServiceUnavailableException('WorkOS did not return a session');
    }

    const user = await this.resolveLocalUser(authResponse.user.id);
    return { sealedSession: authResponse.sealedSession, user };
  }

  async verifySession(sealedSession: string | undefined): Promise<SessionResult> {
    if (!this.isConfigured && this.config.nodeEnv !== 'production') {
      return this.verifyDevelopmentSession(sealedSession);
    }

    const { workos, cookiePassword } = this.requireConfigured();
    if (!sealedSession) {
      throw new UnauthorizedException('Not authenticated');
    }

    const session = workos.userManagement.loadSealedSession({
      sessionData: sealedSession,
      cookiePassword,
    });

    const authResult = await session.authenticate();
    if (authResult.authenticated) {
      const user = await this.resolveLocalUser(authResult.user.id);
      return { user };
    }

    const refreshResult = await session.refresh({ cookiePassword });
    if (!refreshResult.authenticated) {
      throw new UnauthorizedException('Session expired');
    }

    const user = await this.resolveLocalUser(refreshResult.user.id);
    return { user, ...(refreshResult.sealedSession ? { refreshedSealedSession: refreshResult.sealedSession } : {}) };
  }

  /** Best-effort: revokes the WorkOS session server-side. Cookie clearing
   *  (done by the caller) is what actually ends the browser's session. */
  async logout(sealedSession: string | undefined): Promise<void> {
    if (!sealedSession || !this.isConfigured) {
      return;
    }
    try {
      const { workos, cookiePassword } = this.requireConfigured();
      const session = workos.userManagement.loadSealedSession({
        sessionData: sealedSession,
        cookiePassword,
      });
      const authResult = await session.authenticate();
      if (authResult.authenticated) {
        await workos.userManagement.revokeSession({ sessionId: authResult.sessionId });
      }
    } catch {
      // Session already invalid/expired — nothing to revoke.
    }
  }

  private async resolveLocalUser(workosUserId: string): Promise<AuthenticatedUser> {
    const user = await prisma.user.findUnique({ where: { workosUserId } });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('No active Sparki account is linked to this login.');
    }

    return this.resolveMembership(user);
  }

  private async loginDevelopmentUser(email: string, password: string): Promise<LoginResult> {
    if (password !== DEVELOPMENT_LOGIN_PASSWORD) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return {
      sealedSession: `${DEVELOPMENT_SESSION_PREFIX}${user.id}`,
      user: await this.resolveMembership(user),
    };
  }

  private async verifyDevelopmentSession(sealedSession: string | undefined): Promise<SessionResult> {
    if (!sealedSession?.startsWith(DEVELOPMENT_SESSION_PREFIX)) {
      throw new UnauthorizedException('Not authenticated');
    }

    const userId = sealedSession.slice(DEVELOPMENT_SESSION_PREFIX.length);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('No active Sparki account is linked to this login.');
    }

    return { user: await this.resolveMembership(user) };
  }

  /**
   * ADR-006: session identity now comes from OrganizationMembership /
   * ClinicLocationAccess, not User.organizationId/role/locations directly
   * (those older fields stay live only for staff.service.ts and dev-seed
   * compatibility during the transition — see the schema comment on User).
   *
   * v1 has no multi-org switcher, so more than one active membership for a
   * user is treated as an unsupported, deterministic error rather than
   * silently picking one — same for location access, which most workflows
   * (creating an Appointment/Visit) require to be a real Location id, not an
   * empty-string placeholder.
   */
  async resolveMembership(user: User): Promise<AuthenticatedUser> {
    const memberships = await prisma.organizationMembership.findMany({
      where: { userId: user.id, isActive: true },
    });

    if (memberships.length === 0) {
      throw new UnauthorizedException('No active Sparki clinic membership for this account.');
    }
    if (memberships.length > 1) {
      throw new ConflictException(
        'MULTIPLE_ACTIVE_MEMBERSHIPS_UNSUPPORTED: this account has more than one active organization membership, which Sparki cannot resolve without a multi-org switcher yet.',
      );
    }
    const membership = memberships[0]!;

    const locationAccesses = await prisma.clinicLocationAccess.findMany({
      where: { userId: user.id, organizationId: membership.organizationId, isActive: true },
    });
    if (locationAccesses.length === 0) {
      throw new UnauthorizedException(
        'No active clinic location access for this account within its organization.',
      );
    }
    if (locationAccesses.length > 1) {
      throw new ConflictException(
        'MULTIPLE_ACTIVE_LOCATION_ACCESS_UNSUPPORTED: this account has more than one active clinic location access, which Sparki cannot resolve without a location switcher yet.',
      );
    }
    const locationAccess = locationAccesses[0]!;

    return {
      id: user.id,
      email: user.email,
      name: user.displayName ?? `${user.firstName} ${user.lastName}`,
      organizationId: membership.organizationId,
      locationId: locationAccess.clinicLocationId,
      role: membership.role,
    };
  }
}
