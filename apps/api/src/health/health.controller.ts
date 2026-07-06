import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { Public } from '../auth/public.decorator';
import { PostgresHealthIndicator } from './postgres.health';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly postgresHealth: PostgresHealthIndicator,
  ) {}

  /** Process liveness: is the API up at all. No dependencies checked. */
  @Public()
  @Get('live')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /** Readiness: can the API actually serve traffic (DB reachable, etc). */
  @Public()
  @Get('ready')
  @HealthCheck()
  ready() {
    return this.health.check([() => this.postgresHealth.isHealthy('database')]);
  }
}
