import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthCheckError, type HealthIndicatorResult } from '@nestjs/terminus';
import { pool } from '@sparki/db';

@Injectable()
export class PostgresHealthIndicator extends HealthIndicator {
  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      await pool.query('SELECT 1');
      return this.getStatus(key, true);
    } catch (error) {
      throw new HealthCheckError(
        'Postgres health check failed',
        this.getStatus(key, false, { message: (error as Error).message }),
      );
    }
  }
}
