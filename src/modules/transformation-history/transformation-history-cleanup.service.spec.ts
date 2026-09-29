import { PrismaService } from '@/core/database/prisma.service';
import { StorageService } from '@/core/storage/storage.service';

import { TransformationHistoryCleanupService } from './transformation-history-cleanup.service';

describe('TransformationHistoryCleanupService', () => {
  let prisma: {
    transformationHistory: { findMany: jest.Mock; deleteMany: jest.Mock };
  };
  let storage: { delete: jest.Mock };
  let service: TransformationHistoryCleanupService;

  beforeEach(() => {
    jest.clearAllMocks();

    prisma = {
      transformationHistory: {
        findMany: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue(undefined),
      },
    };
    storage = { delete: jest.fn().mockResolvedValue(undefined) };

    service = new TransformationHistoryCleanupService(
      prisma as unknown as PrismaService,
      storage as unknown as StorageService,
    );

    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does nothing when there are no expired records', async () => {
    prisma.transformationHistory.findMany.mockResolvedValue([]);

    await service.purgeExpired();

    expect(storage.delete).not.toHaveBeenCalled();
    expect(prisma.transformationHistory.deleteMany).not.toHaveBeenCalled();
  });

  it('deletes files for expired records with a fileId, then deletes the rows', async () => {
    prisma.transformationHistory.findMany.mockResolvedValue([
      { id: 'a', fileId: 'key-a' },
      { id: 'b', fileId: null },
      { id: 'c', fileId: 'key-c' },
    ]);

    await service.purgeExpired();

    expect(storage.delete).toHaveBeenCalledTimes(2);
    expect(storage.delete).toHaveBeenCalledWith('key-a');
    expect(storage.delete).toHaveBeenCalledWith('key-c');

    expect(prisma.transformationHistory.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['a', 'b', 'c'] } },
    });
  });

  it('continues deleting remaining files and still deletes all rows when one storage delete fails', async () => {
    storage.delete.mockImplementation((key: string) => {
      if (key === 'key-a') {
        return Promise.reject(new Error('s3 failure'));
      }
      return Promise.resolve(undefined);
    });

    prisma.transformationHistory.findMany.mockResolvedValue([
      { id: 'a', fileId: 'key-a' },
      { id: 'b', fileId: 'key-b' },
    ]);

    await service.purgeExpired();

    expect(storage.delete).toHaveBeenCalledWith('key-a');
    expect(storage.delete).toHaveBeenCalledWith('key-b');
    expect(prisma.transformationHistory.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['a', 'b'] } },
    });
  });

  it('queries for records whose expiresAt is in the past', async () => {
    prisma.transformationHistory.findMany.mockResolvedValue([]);
    const before = Date.now();

    await service.purgeExpired();

    const callArg = prisma.transformationHistory.findMany.mock.calls[0][0];
    expect(callArg.select).toEqual({ id: true, fileId: true });
    expect(callArg.where.expiresAt.lt.getTime()).toBeGreaterThanOrEqual(before);
  });
});
