import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { WorkOS } from '@workos-inc/node';
import { prisma, type User } from '@sparki/db';
import { AppConfigService } from '../config/app-config.service';
import { EmailService } from '../email/email.service';
import { signInCodeEmail } from '../email/templates';
import type { AuthenticatedUser } from './types';
import type { UpdateProfileInput } from './dto/update-profile.schema';

const DEVELOPMENT_LOGIN_PASSWORD = 'SparkiTest123!';
const DEVELOPMENT_SESSION_PREFIX = 'dev:';
// WorkOS Magic Auth codes are themselves single-use and short-lived (see
// requestEmailCode/verifyEmailCode below); this is a separate, coarser guard
// against one account triggering unlimited code sends/emails.
const EMAIL_CODE_COOLDOWN_MS = 60_000;
const EMAIL_CODE_EXPIRY_MINUTES = 10;

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

  constructor(
    private readonly config: AppConfigService,
    private readonly email: EmailService,
  ) {
    const { apiKey, clientId, cookiePassword } = this.config.workos;
    // clientId must be passed here, not just per-call to
    // authenticateWithPassword/etc: UserManagement.jwks (used by
    // loadSealedSession(...).authenticate()/refresh() to verify a session's
    // JWT) reads clientId from this client's own construction options, not
    // from any per-call argument. Without it, every session verification —
    // not just some — throws "Missing client ID" from inside the WorkOS SDK
    // (session.js's isValidJwt), even though minting a session via login/
    // signup works fine (that path takes clientId per-call, separately).
    this.workos = apiKey ? new WorkOS(apiKey, clientId ? { clientId } : {}) : null;
    this.clientId = clientId;
    this.cookiePassword = cookiePassword;

    // Fail at boot, not at request time: a production deploy with WorkOS
    // misconfigured should never come up and start 503-ing every request.
    if (!this.isConfigured && this.config.developmentAuthMode !== 'fixed') {
      throw new Error(
        'WorkOS AuthKit is not configured and fixed development auth was not explicitly enabled — refusing to start.',
      );
    }
  }

  get isConfigured(): boolean {
    return Boolean(this.workos && this.clientId && this.cookiePassword);
  }

  async getProfile(userId: string) {
    return prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true, phone: true, firstName: true, lastName: true, displayName: true, avatarUrl: true, statusEmoji: true, statusText: true, role: true },
    });
  }

  async updateProfile(userId: string, input: UpdateProfileInput) {
    return prisma.user.update({
      where: { id: userId },
      data: {
        displayName: input.displayName,
        phone: input.phone || null,
        avatarUrl: input.avatarUrl || null,
        statusEmoji: input.statusEmoji || null,
        statusText: input.statusText || null,
      },
      select: { id: true, email: true, phone: true, firstName: true, lastName: true, displayName: true, avatarUrl: true, statusEmoji: true, statusText: true, role: true },
    });
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
    if (!this.isConfigured && this.config.developmentAuthMode === 'fixed') {
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

  /**
   * Passwordless sign-in, additive to login() — same WorkOS-backed users,
   * same session cookie, just a different first factor. Built on WorkOS
   * Magic Auth rather than a bespoke OTP store: WorkOS owns code generation,
   * expiry, and single-use enforcement (the same trust boundary as password
   * auth), and Sparki only delivers the code through its own branded email.
   *
   * Never reveals whether `email` has a Sparki account — an unknown,
   * inactive, or not-yet-activated (no workosUserId) email returns
   * successfully having sent nothing, exactly like a real send. This also
   * covers the cooldown case: a request inside the window returns the same
   * way rather than surfacing a distinguishable "please wait" response.
   */
  async requestEmailCode(email: string): Promise<void> {
    const normalized = email.trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email: normalized } });
    if (!user || !user.isActive || !user.workosUserId) {
      return;
    }
    if (user.lastEmailCodeRequestedAt && Date.now() - user.lastEmailCodeRequestedAt.getTime() < EMAIL_CODE_COOLDOWN_MS) {
      return;
    }

    const { workos } = this.requireConfigured();
    const magicAuth = await workos.userManagement.createMagicAuth({ email: normalized });

    await prisma.user.update({ where: { id: user.id }, data: { lastEmailCodeRequestedAt: new Date() } });

    await this.email.send({
      to: normalized,
      ...signInCodeEmail({ code: magicAuth.code, expiresInMinutes: EMAIL_CODE_EXPIRY_MINUTES }),
    });
  }

  async verifyEmailCode(email: string, code: string): Promise<LoginResult> {
    const { workos, clientId, cookiePassword } = this.requireConfigured();
    const normalized = email.trim().toLowerCase();

    let authResponse;
    try {
      authResponse = await workos.userManagement.authenticateWithMagicAuth({
        clientId,
        email: normalized,
        code,
        session: { sealSession: true, cookiePassword },
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired code');
    }

    if (!authResponse.sealedSession) {
      throw new ServiceUnavailableException('WorkOS did not return a session');
    }

    const user = await this.resolveLocalUser(authResponse.user.id);
    return { sealedSession: authResponse.sealedSession, user };
  }

  async verifySession(sealedSession: string | undefined): Promise<SessionResult> {
    if (!this.isConfigured && this.config.developmentAuthMode === 'fixed') {
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

    // Unlike authenticate() above, the WorkOS SDK's session.refresh() does
    // not catch its own cookie-unseal failure — an invalid/corrupt cookie
    // (the same condition authenticate() just handled gracefully) throws
    // here uncaught instead of returning { authenticated: false }. Treat it
    // the same way authenticate() would: an expired/invalid session, not a
    // server error.
    let refreshResult;
    try {
      refreshResult = await session.refresh({ cookiePassword });
    } catch {
      throw new UnauthorizedException('Session expired');
    }
    if (!refreshResult.authenticated) {
      throw new UnauthorizedException('Session expired');
    }

    const user = await this.resolveLocalUser(refreshResult.user.id);
    return { user, ...(refreshResult.sealedSession ? { refreshedSealedSession: refreshResult.sealedSession } : {}) };
  }

  /**
   * Idempotent lookup-or-create of the WorkOS credential for a brand-new
   * Sparki user (invitation acceptance — see InvitationsService.accept).
   * Mirrors scripts/seed-auth-users.mjs's ensureWorkosUser, productionized:
   * looking up by email first means a retried request (e.g. the transaction
   * that follows this call fails and the caller retries) never creates a
   * duplicate WorkOS user. Returns null when WorkOS isn't configured — only
   * reachable outside production, where SPARKI_DEVELOPMENT_AUTH=fixed lets a
   * User row with no workosUserId still sign in (see login/loginDevelopmentUser
   * above); the constructor guard above refuses to boot that combination in
   * production.
   */
  async ensureWorkosCredential(params: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  }): Promise<string | null> {
    if (!this.isConfigured) {
      return null;
    }
    const { workos } = this.requireConfigured();

    const existing = await workos.userManagement.listUsers({ email: params.email, limit: 1 });
    const [match] = existing.data;
    try {
      if (match) {
        await workos.userManagement.updateUser({
          userId: match.id,
          password: params.password,
          emailVerified: true,
          firstName: params.firstName,
          lastName: params.lastName,
        });
        return match.id;
      }

      const created = await workos.userManagement.createUser({
        email: params.email,
        password: params.password,
        emailVerified: true,
        firstName: params.firstName,
        lastName: params.lastName,
      });
      return created.id;
    } catch (error) {
      throw toPasswordStrengthError(error) ?? error;
    }
  }

  /**
   * Issues a session for a user InvitationsService just created or verified,
   * without a second round-trip through WorkOS's password-authenticate flow
   * as a *login* — invitation-token possession is already the trust
   * boundary (see InvitationsService.accept), so this only needs to mint the
   * session, not re-verify identity. Still goes through
   * authenticateWithPassword in real-WorkOS mode because that's the only
   * supported way to obtain a sealed session from this WorkOS SDK version;
   * `password` is the same one ensureWorkosCredential just set, so it always
   * succeeds barring a WorkOS outage.
   */
  async issueSessionForNewUser(user: User, password: string): Promise<LoginResult> {
    const authenticatedUser = await this.resolveMembership(user);

    if (!this.isConfigured && this.config.developmentAuthMode === 'fixed') {
      return {
        sealedSession: `${DEVELOPMENT_SESSION_PREFIX}${user.id}`,
        user: authenticatedUser,
      };
    }

    const { workos, clientId, cookiePassword } = this.requireConfigured();
    let authResponse;
    try {
      authResponse = await workos.userManagement.authenticateWithPassword({
        clientId,
        email: user.email,
        password,
        session: { sealSession: true, cookiePassword },
      });
    } catch {
      throw new ServiceUnavailableException('Unable to start a session for the newly created account.');
    }
    if (!authResponse.sealedSession) {
      throw new ServiceUnavailableException('WorkOS did not return a session');
    }

    return { sealedSession: authResponse.sealedSession, user: authenticatedUser };
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

    // Subscription state is authoritative from Organization (billing-webhook
    // verified — see apps/api/src/billing), read fresh on every session
    // resolution so a lapsed subscription takes effect on the next request,
    // not just the next login. SubscriptionGuard is what actually enforces
    // it; this only carries the value onto the request identity.
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: membership.organizationId },
      select: { subscriptionStatus: true },
    });

    return {
      id: user.id,
      email: user.email,
      name: user.displayName ?? `${user.firstName} ${user.lastName}`,
      organizationId: membership.organizationId,
      locationId: locationAccess.clinicLocationId,
      role: membership.role,
      subscriptionStatus: organization.subscriptionStatus,
      canManageAdminSettings: user.canManageAdminSettings,
      canFinalizeRecordsForOthers: user.canFinalizeRecordsForOthers,
      canManageMedications: user.canManageMedications,
    };
  }
}

/**
 * WorkOS rejects createUser/updateUser with a 400 whose `code` is
 * `password_strength_error` and an `errors` array of per-issue messages
 * (their SDK's BadRequestException — duck-typed here rather than imported,
 * since it isn't part of @workos-inc/node's public type exports). Without
 * this, the real reason ("must be 10+ characters", "commonly used
 * password") was lost behind a generic "couldn't create your account"
 * message — see the WORKOS_API_KEY debugging session this followed.
 */
function toPasswordStrengthError(error: unknown): BadRequestException | null {
  if (
    typeof error !== 'object' ||
    error === null ||
    !('code' in error) ||
    (error as { code?: unknown }).code !== 'password_strength_error'
  ) {
    return null;
  }
  const issues = (error as { errors?: Array<{ message?: string }> }).errors ?? [];
  const message =
    issues.map((issue) => issue.message).filter((text): text is string => Boolean(text)).join(' ') ||
    'Choose a stronger password.';
  return new BadRequestException({ code: 'PASSWORD_TOO_WEAK', message });
}
