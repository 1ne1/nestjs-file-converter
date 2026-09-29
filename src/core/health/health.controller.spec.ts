import { ConfigService } from '@/core/config/config.service';

import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  let controller: HealthController;
  let healthService: { getEmptyResponse: jest.Mock; checkHealth: jest.Mock };
  let configValues: Record<string, unknown>;

  beforeEach(() => {
    healthService = {
      getEmptyResponse: jest
        .fn()
        .mockReturnValue({ status: 'ok', details: {} }),
      checkHealth: jest.fn().mockResolvedValue({ status: 'ok', info: {} }),
    };
    configValues = { HEALTH_CHECK_ENABLED: false };

    const config = {
      get: (key: string) => configValues[key],
    } as unknown as ConfigService;

    controller = new HealthController(
      healthService as unknown as HealthService,
      config,
    );
  });

  it('returns the empty response and skips real checks when disabled', async () => {
    const result = await controller.check();

    expect(result).toEqual({ status: 'ok', details: {} });
    expect(healthService.getEmptyResponse).toHaveBeenCalledTimes(1);
    expect(healthService.checkHealth).not.toHaveBeenCalled();
  });

  it('runs real checks when enabled', async () => {
    configValues.HEALTH_CHECK_ENABLED = true;

    const result = await controller.check();

    expect(healthService.checkHealth).toHaveBeenCalledTimes(1);
    expect(healthService.getEmptyResponse).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'ok', info: {} });
  });
});
