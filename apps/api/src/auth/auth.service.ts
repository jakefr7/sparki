import { Injectable, NotImplementedException } from '@nestjs/common';
import { WorkOS } from '@workos-inc/node';
import { AppConfigService } from '../config/app-config.service';
import type { AuthenticatedUser } from './types';

/**
 * Wraps WorkOS AuthKit per docs/engineering/00-engineering-plan.md. Sprint 0
 * ships the module wiring (guard, decorators, this service) so every route
 * already goes through one authentication seam. No WORKOS_API_KEY is
 * configured yet, so verification intentionally throws until Sprint 1 wires
 * real session verification and maps WorkOS users to Sparki's own
 * User/Role records.
 */
@Injectable()
export class AuthService {
  private readonly workos: WorkOS | null;

  constructor(private readonly config: AppConfigService) {
    const { apiKey } = this.config.workos;
    this.workos = apiKey ? new WorkOS(apiKey) : null;
  }

  async verifyToken(_token: string): Promise<AuthenticatedUser> {
    if (!this.workos) {
      throw new NotImplementedException(
        'WorkOS AuthKit is not configured. Set WORKOS_API_KEY to enable authentication.',
      );
    }

    throw new NotImplementedException('WorkOS session verification is not implemented yet.');
  }
}
