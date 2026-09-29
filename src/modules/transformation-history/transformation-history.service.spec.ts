import { NotFoundException } from '@nestjs/common';

import { ConfigService } from '@/core/config/config.service';
import { PrismaService } from '@/core/database/prisma.service';
import { StorageService } from '@/core/storage/storage.service';
import {
  TransformationStatus,
  TransformationType,
} from '@/generated/prisma/client';

import { TransformationHistoryService } from './transformation-history.service';

describe('TransformationHistoryService', () => {
  let prisma: {
    transformationHistory: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
    };
  };
  let storage: { upload: jest.Mock; download: jest.Mock; delete: jest.Mock };
  let config: { get: jest.Mock };
  let service: TransformationHistoryService;

  beforeEach(() => {
    jest.clearAllMocks();

    prisma = {
      transformationHistory: {
        create: jest.fn().mockResolvedValue(undefined),
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
    };
    storage = {
      upload: jest.fn().mockResolvedValue(undefined),
      download: jest.fn(),
      delete: jest.fn(),
    };
    config = { get: jest.fn().mockReturnValue(90) };

    service = new TransformationHistoryService(
      prisma as unknown as PrismaService,
      storage as unknown as StorageService,
      config as unknown as ConfigService,
    );

    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('record', () => {
    const baseParams = {
      userId: 'user-1',
      type: TransformationType.FILE,
      sourceFormat: 'csv',
      targetFormat: 'json',
      status: TransformationStatus.SUCCESS,
      fileSize: 123,
      durationMs: 10,
    };

    it('creates a history row without a fileId when save is omitted', async () => {
      await service.record(baseParams);

      expect(storage.upload).not.toHaveBeenCalled();
      expect(prisma.transformationHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          fileId: undefined,
          fileContentType: undefined,
        }),
      });
    });

    it('uploads the file and records the fileId and content type when save is provided', async () => {
      await service.record({
        ...baseParams,
        save: {
          buffer: Buffer.from('hello'),
          contentType: 'application/json',
          extension: 'json',
        },
      });

      expect(storage.upload).toHaveBeenCalledTimes(1);
      const [key, buffer, contentType] = storage.upload.mock.calls[0];
      expect(key).toMatch(/^transformations\/user-1\/.+\.json$/);
      expect(buffer).toEqual(Buffer.from('hello'));
      expect(contentType).toBe('application/json');

      expect(prisma.transformationHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          fileId: key,
          fileContentType: 'application/json',
        }),
      });
    });

    it('swallows a storage upload failure, still creating the row without a fileId', async () => {
      storage.upload.mockRejectedValue(new Error('s3 down'));

      await expect(
        service.record({
          ...baseParams,
          save: {
            buffer: Buffer.from('hello'),
            contentType: 'application/json',
            extension: 'json',
          },
        }),
      ).resolves.toBeUndefined();

      expect(prisma.transformationHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          fileId: undefined,
          fileContentType: undefined,
        }),
      });
    });

    it('swallows a Prisma failure without throwing', async () => {
      prisma.transformationHistory.create.mockRejectedValue(
        new Error('db down'),
      );

      await expect(service.record(baseParams)).resolves.toBeUndefined();
    });

    it('computes expiresAt from the configured retention days', async () => {
      config.get.mockReturnValue(1);
      const now = Date.now();

      await service.record(baseParams);

      const { expiresAt } =
        prisma.transformationHistory.create.mock.calls[0][0].data;
      const diffMs = expiresAt.getTime() - now;
      expect(diffMs).toBeGreaterThan(23 * 60 * 60 * 1000);
      expect(diffMs).toBeLessThan(25 * 60 * 60 * 1000);
    });
  });

  describe('list', () => {
    const makeRow = (overrides: Record<string, unknown> = {}) => ({
      id: 'row-1',
      userId: 'user-1',
      type: TransformationType.FILE,
      sourceFormat: 'csv',
      targetFormat: 'json',
      status: TransformationStatus.SUCCESS,
      fileSize: 10,
      durationMs: 5,
      errorCode: null,
      fileId: null,
      fileContentType: null,
      expiresAt: new Date(Date.now() + 86400000),
      createdAt: new Date(),
      ...overrides,
    });

    it('builds a where clause using only the provided filters', async () => {
      prisma.transformationHistory.findMany.mockResolvedValue([]);

      await service.list({ userId: 'user-1', limit: 20 });

      expect(prisma.transformationHistory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1' },
        }),
      );
    });

    it('includes type, sourceFormat, targetFormat, status and date range filters when given', async () => {
      prisma.transformationHistory.findMany.mockResolvedValue([]);

      const createdAtFrom = new Date('2026-01-01');
      const createdAtTo = new Date('2026-02-01');

      await service.list({
        userId: 'user-1',
        limit: 20,
        type: TransformationType.IMAGE,
        sourceFormat: 'png',
        targetFormat: 'jpeg',
        status: TransformationStatus.ERROR,
        createdAtFrom,
        createdAtTo,
      });

      expect(prisma.transformationHistory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: 'user-1',
            type: TransformationType.IMAGE,
            sourceFormat: 'png',
            targetFormat: 'jpeg',
            status: TransformationStatus.ERROR,
            createdAt: { gte: createdAtFrom, lte: createdAtTo },
          },
        }),
      );
    });

    it('applies the cursor when provided', async () => {
      prisma.transformationHistory.findMany.mockResolvedValue([]);

      await service.list({ userId: 'user-1', limit: 20, cursor: 'row-9' });

      expect(prisma.transformationHistory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          cursor: { id: 'row-9' },
          skip: 1,
        }),
      );
    });

    it('returns nextCursor null and all items when there are fewer rows than the limit', async () => {
      const rows = [makeRow({ id: 'a' }), makeRow({ id: 'b' })];
      prisma.transformationHistory.findMany.mockResolvedValue(rows);

      const result = await service.list({ userId: 'user-1', limit: 2 });

      expect(result.items).toHaveLength(2);
      expect(result.nextCursor).toBeNull();
    });

    it('returns nextCursor and trims the extra row when more rows than the limit come back', async () => {
      const rows = [
        makeRow({ id: 'a' }),
        makeRow({ id: 'b' }),
        makeRow({ id: 'c' }),
      ];
      prisma.transformationHistory.findMany.mockResolvedValue(rows);

      const result = await service.list({ userId: 'user-1', limit: 2 });

      expect(result.items).toHaveLength(2);
      expect(result.items.map((item) => item.id)).toEqual(['a', 'b']);
      expect(result.nextCursor).toBe('b');
    });

    it('marks hasSavedFile true only when fileId is present and not expired', async () => {
      const rows = [
        makeRow({ id: 'valid', fileId: 'key-1' }),
        makeRow({
          id: 'expired',
          fileId: 'key-2',
          expiresAt: new Date(Date.now() - 1000),
        }),
        makeRow({ id: 'none', fileId: null }),
      ];
      prisma.transformationHistory.findMany.mockResolvedValue(rows);

      const result = await service.list({ userId: 'user-1', limit: 10 });

      const byId = Object.fromEntries(
        result.items.map((item) => [item.id, item.hasSavedFile]),
      );
      expect(byId.valid).toBe(true);
      expect(byId.expired).toBe(false);
      expect(byId.none).toBe(false);
    });
  });

  describe('findById', () => {
    it('delegates to prisma findUnique by id', async () => {
      prisma.transformationHistory.findUnique.mockResolvedValue({ id: 'x' });

      const result = await service.findById('x');

      expect(prisma.transformationHistory.findUnique).toHaveBeenCalledWith({
        where: { id: 'x' },
      });
      expect(result).toEqual({ id: 'x' });
    });
  });

  describe('getFileStream', () => {
    const baseRecord = {
      id: 'row-1',
      userId: 'user-1',
      type: TransformationType.FILE,
      sourceFormat: 'csv',
      targetFormat: 'json',
      status: TransformationStatus.SUCCESS,
      fileSize: 10,
      durationMs: 5,
      errorCode: null,
      fileContentType: 'application/json',
      createdAt: new Date(),
    };

    it('throws NotFoundException when fileId is missing', async () => {
      await expect(
        service.getFileStream({
          ...baseRecord,
          fileId: null,
          expiresAt: new Date(Date.now() + 86400000),
        } as never),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException when the record has expired', async () => {
      await expect(
        service.getFileStream({
          ...baseRecord,
          fileId: 'key-1',
          expiresAt: new Date(Date.now() - 1000),
        } as never),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns the stream and content type from storage when valid', async () => {
      const fakeStream = { pipe: jest.fn() };
      storage.download.mockResolvedValue(fakeStream);

      const result = await service.getFileStream({
        ...baseRecord,
        fileId: 'key-1',
        expiresAt: new Date(Date.now() + 86400000),
      } as never);

      expect(storage.download).toHaveBeenCalledWith('key-1');
      expect(result.stream).toBe(fakeStream);
      expect(result.contentType).toBe('application/json');
    });

    it('falls back to application/octet-stream when fileContentType is missing', async () => {
      storage.download.mockResolvedValue({ pipe: jest.fn() });

      const result = await service.getFileStream({
        ...baseRecord,
        fileId: 'key-1',
        fileContentType: null,
        expiresAt: new Date(Date.now() + 86400000),
      } as never);

      expect(result.contentType).toBe('application/octet-stream');
    });
  });
});
