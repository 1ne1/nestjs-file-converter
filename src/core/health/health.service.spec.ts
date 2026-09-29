import type { HealthIndicatorFunction } from '@nestjs/terminus';
import { HealthCheckError, HealthCheckService } from '@nestjs/terminus';

import { PrismaService } from '@/core/database/prisma.service';
import { StorageService } from '@/core/storage/storage.service';

import { HealthService } from './health.service';

describe('HealthService', () => {
  let service: HealthService;
  let healthCheckService: { check: jest.Mock };
  let prisma: { $queryRaw: jest.Mock };
  let storage: { ping: jest.Mock };

  beforeEach(() => {
    healthCheckService = { check: jest.fn() };
    prisma = { $queryRaw: jest.fn() };
    storage = { ping: jest.fn() };

    service = new HealthService(
      healthCheckService as unknown as HealthCheckService,
      prisma as unknown as PrismaService,
      storage as unknown as StorageService,
    );
  });

  function getIndicators(): [HealthIndicatorFunction, HealthIndicatorFunction] {
    void service.checkHealth();
    const [databaseIndicator, storageIndicator] = healthCheckService.check.mock
      .calls[0][0] as HealthIndicatorFunction[];
    return [databaseIndicator, storageIndicator];
  }

  it('getEmptyResponse returns an ok status with no details', () => {
    expect(service.getEmptyResponse()).toEqual({ status: 'ok', details: {} });
  });

  it('checkHealth delegates to HealthCheckService.check with two indicators', () => {
    void service.checkHealth();

    expect(healthCheckService.check).toHaveBeenCalledTimes(1);
    const indicators = healthCheckService.check.mock.calls[0][0] as unknown[];
    expect(indicators).toHaveLength(2);
  });

  it('database indicator resolves up when the query succeeds', async () => {
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    const [databaseIndicator] = getIndicators();

    await expect(databaseIndicator()).resolves.toEqual({
      database: { status: 'up' },
    });
  });

  it('database indicator throws HealthCheckError when the query fails', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('connection refused'));
    const [databaseIndicator] = getIndicators();

    await expect(databaseIndicator()).rejects.toBeInstanceOf(HealthCheckError);
  });

  it('database indicator failure carries the down cause', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('connection refused'));
    const [databaseIndicator] = getIndicators();

    await expect(databaseIndicator()).rejects.toMatchObject({
      causes: { database: { status: 'down' } },
    });
  });

  it('storage indicator resolves up when ping succeeds', async () => {
    storage.ping.mockResolvedValue(undefined);
    const [, storageIndicator] = getIndicators();

    await expect(storageIndicator()).resolves.toEqual({
      storage: { status: 'up' },
    });
  });

  it('storage indicator throws HealthCheckError when ping fails', async () => {
    storage.ping.mockRejectedValue(new Error('unreachable'));
    const [, storageIndicator] = getIndicators();

    await expect(storageIndicator()).rejects.toBeInstanceOf(HealthCheckError);
  });

  it('storage indicator failure carries the down cause', async () => {
    storage.ping.mockRejectedValue(new Error('unreachable'));
    const [, storageIndicator] = getIndicators();

    await expect(storageIndicator()).rejects.toMatchObject({
      causes: { storage: { status: 'down' } },
    });
  });
});
