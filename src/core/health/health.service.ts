import { Injectable } from '@nestjs/common';
import {
  HealthCheckError,
  HealthCheckService,
  HealthCheckResult,
  HealthIndicatorResult,
} from '@nestjs/terminus';

import { PrismaService } from '@/core/database/prisma.service';
import { StorageService } from '@/core/storage/storage.service';

@Injectable()
export class HealthService {
  constructor(
    private readonly healthCheckService: HealthCheckService,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  getEmptyResponse(): HealthCheckResult {
    return {
      status: 'ok',
      details: {},
    };
  }

  checkHealth() {
    return this.healthCheckService.check([
      () => this.checkDatabase(),
      () => this.checkStorage(),
    ]);
  }

  private async checkDatabase(): Promise<HealthIndicatorResult> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { database: { status: 'up' } };
    } catch {
      throw new HealthCheckError('Database check failed', {
        database: { status: 'down' },
      });
    }
  }

  private async checkStorage(): Promise<HealthIndicatorResult> {
    try {
      await this.storage.ping();
      return { storage: { status: 'up' } };
    } catch {
      throw new HealthCheckError('Storage check failed', {
        storage: { status: 'down' },
      });
    }
  }
}
