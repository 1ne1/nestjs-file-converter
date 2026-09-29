import { ForbiddenException, NotFoundException } from '@nestjs/common';

import type { AuthenticatedRequest } from '@/core/auth/jwt-auth.guard';
import {
  TransformationStatus,
  TransformationType,
} from '@/generated/prisma/client';
import { RbacService } from '@/modules/rbac/rbac.service';

import { TransformationHistoryController } from './transformation-history.controller';
import { TransformationHistoryService } from './transformation-history.service';

describe('TransformationHistoryController', () => {
  let history: {
    list: jest.Mock;
    findById: jest.Mock;
    getFileStream: jest.Mock;
  };
  let rbac: { hasPermission: jest.Mock };
  let controller: TransformationHistoryController;

  const req = (userId: string): AuthenticatedRequest =>
    ({
      user: { id: userId, email: 'user@example.com' },
    }) as AuthenticatedRequest;

  beforeEach(() => {
    jest.clearAllMocks();

    history = {
      list: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
      findById: jest.fn(),
      getFileStream: jest.fn(),
    };
    rbac = { hasPermission: jest.fn().mockResolvedValue(false) };

    controller = new TransformationHistoryController(
      history as unknown as TransformationHistoryService,
      rbac as unknown as RbacService,
    );
  });

  describe('list', () => {
    it('lists the caller own history when userId is omitted', async () => {
      await controller.list(req('user-1'), { limit: 20 } as never);

      expect(rbac.hasPermission).not.toHaveBeenCalled();
      expect(history.list).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1' }),
      );
    });

    it('lists the caller own history when userId matches the caller', async () => {
      await controller.list(req('user-1'), {
        userId: 'user-1',
        limit: 20,
      } as never);

      expect(rbac.hasPermission).not.toHaveBeenCalled();
      expect(history.list).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1' }),
      );
    });

    it('throws ForbiddenException when requesting another user without admin permission', async () => {
      rbac.hasPermission.mockResolvedValue(false);

      await expect(
        controller.list(req('user-1'), {
          userId: 'user-2',
          limit: 20,
        } as never),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(history.list).not.toHaveBeenCalled();
    });

    it('lists another user history when the caller has admin permission', async () => {
      rbac.hasPermission.mockResolvedValue(true);

      await controller.list(req('user-1'), {
        userId: 'user-2',
        limit: 20,
      } as never);

      expect(rbac.hasPermission).toHaveBeenCalledWith(
        'user-1',
        'transformations.history.admin',
      );
      expect(history.list).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-2' }),
      );
    });

    it('uppercases type and status and converts date strings to Date instances', async () => {
      await controller.list(req('user-1'), {
        limit: 20,
        type: 'file',
        status: 'error',
        sourceFormat: 'csv',
        targetFormat: 'json',
        createdAtFrom: '2026-01-01T00:00:00.000Z',
        createdAtTo: '2026-02-01T00:00:00.000Z',
      } as never);

      expect(history.list).toHaveBeenCalledWith({
        userId: 'user-1',
        cursor: undefined,
        limit: 20,
        type: TransformationType.FILE,
        sourceFormat: 'csv',
        targetFormat: 'json',
        status: TransformationStatus.ERROR,
        createdAtFrom: new Date('2026-01-01T00:00:00.000Z'),
        createdAtTo: new Date('2026-02-01T00:00:00.000Z'),
      });
    });

    it('leaves optional filters undefined when not provided', async () => {
      await controller.list(req('user-1'), { limit: 20 } as never);

      expect(history.list).toHaveBeenCalledWith({
        userId: 'user-1',
        cursor: undefined,
        limit: 20,
        type: undefined,
        sourceFormat: undefined,
        targetFormat: undefined,
        status: undefined,
        createdAtFrom: undefined,
        createdAtTo: undefined,
      });
    });
  });

  describe('download', () => {
    const res = () =>
      ({ header: jest.fn() }) as unknown as {
        header: jest.Mock;
      };

    it('throws NotFoundException when the record does not exist', async () => {
      history.findById.mockResolvedValue(null);

      await expect(
        controller.download('item-1', req('user-1'), res() as never),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(history.getFileStream).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when the record belongs to another user and caller lacks admin permission', async () => {
      history.findById.mockResolvedValue({ id: 'item-1', userId: 'owner' });
      rbac.hasPermission.mockResolvedValue(false);

      await expect(
        controller.download('item-1', req('someone-else'), res() as never),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(history.getFileStream).not.toHaveBeenCalled();
    });

    it('allows the owner to download their own record without checking rbac', async () => {
      const record = {
        id: 'item-1',
        userId: 'user-1',
        targetFormat: 'json',
      };
      history.findById.mockResolvedValue(record);
      history.getFileStream.mockResolvedValue({
        stream: 'the-stream',
        contentType: 'application/json',
      });
      const reply = res();

      const result = await controller.download(
        'item-1',
        req('user-1'),
        reply as never,
      );

      expect(rbac.hasPermission).not.toHaveBeenCalled();
      expect(result).toBe('the-stream');
      expect(reply.header).toHaveBeenCalledWith(
        'Content-Type',
        'application/json',
      );
      expect(reply.header).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="transformation-item-1.json"',
      );
    });

    it('allows an admin to download another user record', async () => {
      const record = {
        id: 'item-1',
        userId: 'owner',
        targetFormat: 'png',
      };
      history.findById.mockResolvedValue(record);
      rbac.hasPermission.mockResolvedValue(true);
      history.getFileStream.mockResolvedValue({
        stream: 'stream-2',
        contentType: 'image/png',
      });

      const result = await controller.download(
        'item-1',
        req('admin-1'),
        res() as never,
      );

      expect(rbac.hasPermission).toHaveBeenCalledWith(
        'admin-1',
        'transformations.history.admin',
      );
      expect(result).toBe('stream-2');
    });
  });
});
