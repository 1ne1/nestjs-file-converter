import { ForbiddenException, NotFoundException } from '@nestjs/common';

import { UsersController } from './users.controller';

describe('UsersController', () => {
  let controller: UsersController;
  let usersService: {
    list: jest.Mock;
    findById: jest.Mock;
    toSelfProfile: jest.Mock;
    toPublicProfile: jest.Mock;
    update: jest.Mock;
    initiateEmailChange: jest.Mock;
    confirmEmailChange: jest.Mock;
    initiateSelfDelete: jest.Mock;
    confirmSelfDelete: jest.Mock;
    remove: jest.Mock;
  };
  let rbac: { hasPermission: jest.Mock };
  let res: { status: jest.Mock; clearCookie: jest.Mock };

  const selfUser = { id: 'user-1', email: 'self@example.com' };
  const otherUser = { id: 'user-2', email: 'other@example.com' };

  beforeEach(() => {
    usersService = {
      list: jest.fn(),
      findById: jest.fn(),
      toSelfProfile: jest.fn().mockReturnValue({ id: 'user-1', full: true }),
      toPublicProfile: jest.fn().mockReturnValue({ id: 'user-1', full: false }),
      update: jest.fn(),
      initiateEmailChange: jest.fn(),
      confirmEmailChange: jest.fn(),
      initiateSelfDelete: jest.fn(),
      confirmSelfDelete: jest.fn(),
      remove: jest.fn(),
    };
    rbac = { hasPermission: jest.fn() };
    res = { status: jest.fn(), clearCookie: jest.fn() };

    controller = new UsersController(usersService as any, rbac as any);
  });

  describe('list', () => {
    it('throws ForbiddenException without the users.list permission', async () => {
      rbac.hasPermission.mockResolvedValue(false);

      await expect(
        controller.list({ user: selfUser } as any, {} as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('returns the service result when permitted', async () => {
      rbac.hasPermission.mockResolvedValue(true);
      usersService.list.mockResolvedValue({ items: [], nextCursor: null });

      const query = { limit: 20, sort: 'createdAt', order: 'desc' } as any;
      const result = await controller.list({ user: selfUser } as any, query);

      expect(usersService.list).toHaveBeenCalledWith(query);
      expect(result).toEqual({ items: [], nextCursor: null });
    });
  });

  describe('getProfile', () => {
    it('returns the self profile without checking permissions when viewing self', async () => {
      usersService.findById.mockResolvedValue({ id: 'user-1' });

      const result = await controller.getProfile('user-1', {
        user: selfUser,
      } as any);

      expect(rbac.hasPermission).not.toHaveBeenCalled();
      expect(usersService.toSelfProfile).toHaveBeenCalled();
      expect(result).toEqual({ id: 'user-1', full: true });
    });

    it('throws ForbiddenException for another user without users.read, even for a nonexistent target', async () => {
      rbac.hasPermission.mockResolvedValue(false);

      await expect(
        controller.getProfile('nonexistent-id', { user: selfUser } as any),
      ).rejects.toThrow(ForbiddenException);
      expect(usersService.findById).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for a permitted viewer when the target does not exist', async () => {
      rbac.hasPermission.mockResolvedValue(true);
      usersService.findById.mockResolvedValue(null);

      await expect(
        controller.getProfile('user-2', { user: selfUser } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns the public profile for a permitted viewer of another user', async () => {
      rbac.hasPermission.mockResolvedValue(true);
      usersService.findById.mockResolvedValue({ id: 'user-2' });

      const result = await controller.getProfile('user-2', {
        user: selfUser,
      } as any);

      expect(usersService.toPublicProfile).toHaveBeenCalled();
      expect(result).toEqual({ id: 'user-1', full: false });
    });
  });

  describe('updateProfile', () => {
    it('allows self to update an allowed field', async () => {
      usersService.findById.mockResolvedValue({ id: 'user-1' });
      usersService.update.mockResolvedValue({ id: 'user-1', name: 'Alice' });

      const result = await controller.updateProfile(
        'user-1',
        { user: selfUser } as any,
        { name: 'Alice' } as any,
      );

      expect(usersService.update).toHaveBeenCalledWith('user-1', {
        name: 'Alice',
      });
      expect(result).toEqual({ id: 'user-1', full: true });
    });

    it('throws ForbiddenException when self tries to update a forbidden field', async () => {
      await expect(
        controller.updateProfile(
          'user-1',
          { user: selfUser } as any,
          { email: 'new@example.com' } as any,
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(usersService.update).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException for admin path without users.update permission', async () => {
      rbac.hasPermission.mockResolvedValue(false);

      await expect(
        controller.updateProfile(
          'user-2',
          { user: selfUser } as any,
          { name: 'Bob' } as any,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows admin to update admin-allowed fields on another user', async () => {
      rbac.hasPermission.mockResolvedValue(true);
      usersService.findById.mockResolvedValue({ id: 'user-2' });
      usersService.update.mockResolvedValue({
        id: 'user-2',
        status: 'BLOCKED',
      });

      const result = await controller.updateProfile(
        'user-2',
        { user: selfUser } as any,
        { status: 'BLOCKED' } as any,
      );

      expect(usersService.update).toHaveBeenCalledWith('user-2', {
        status: 'BLOCKED',
      });
      expect(result).toEqual({ id: 'user-1', full: false });
    });

    it('throws ForbiddenException when admin tries a field outside the admin allow-list', async () => {
      rbac.hasPermission.mockResolvedValue(true);

      await expect(
        controller.updateProfile(
          'user-2',
          { user: selfUser } as any,
          { unknownField: 'x' } as any,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when the target does not exist', async () => {
      usersService.findById.mockResolvedValue(null);

      await expect(
        controller.updateProfile(
          'user-1',
          { user: selfUser } as any,
          { name: 'Alice' } as any,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('initiateEmailChange', () => {
    it('throws ForbiddenException when not self', async () => {
      await expect(
        controller.initiateEmailChange('user-2', { user: selfUser } as any, {
          newEmail: 'new@example.com',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('delegates to usersService for self', async () => {
      usersService.initiateEmailChange.mockResolvedValue({
        challengeId: 'chal-1',
      });

      const result = await controller.initiateEmailChange(
        'user-1',
        { user: selfUser } as any,
        { newEmail: 'new@example.com' },
      );

      expect(usersService.initiateEmailChange).toHaveBeenCalledWith(
        'user-1',
        'new@example.com',
      );
      expect(result).toEqual({
        requiresConfirmation: true,
        challengeId: 'chal-1',
      });
    });
  });

  describe('confirmEmailChangeOtp / confirmEmailChangeLink', () => {
    it('throws ForbiddenException when not self (otp)', async () => {
      await expect(
        controller.confirmEmailChangeOtp('user-2', { user: selfUser } as any, {
          challengeId: 'chal-1',
          code: '111111',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('confirms via otp for self', async () => {
      usersService.confirmEmailChange.mockResolvedValue({ id: 'user-1' });

      const result = await controller.confirmEmailChangeOtp(
        'user-1',
        { user: selfUser } as any,
        { challengeId: 'chal-1', code: '111111' },
      );

      expect(usersService.confirmEmailChange).toHaveBeenCalledWith(
        'user-1',
        'chal-1',
        '111111',
      );
      expect(result).toEqual({ id: 'user-1', full: true });
    });

    it('throws ForbiddenException when not self (link)', async () => {
      await expect(
        controller.confirmEmailChangeLink('user-2', { user: selfUser } as any, {
          challengeId: 'chal-1',
          token: 'tok-1',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('confirms via link for self', async () => {
      usersService.confirmEmailChange.mockResolvedValue({ id: 'user-1' });

      const result = await controller.confirmEmailChangeLink(
        'user-1',
        { user: selfUser } as any,
        { challengeId: 'chal-1', token: 'tok-1' },
      );

      expect(usersService.confirmEmailChange).toHaveBeenCalledWith(
        'user-1',
        'chal-1',
        'tok-1',
      );
      expect(result).toEqual({ id: 'user-1', full: true });
    });
  });

  describe('remove', () => {
    it('initiates a self-delete challenge for self and does not set 204', async () => {
      usersService.initiateSelfDelete.mockResolvedValue({
        challengeId: 'chal-3',
      });

      const result = await controller.remove(
        'user-1',
        { user: selfUser } as any,
        res as any,
      );

      expect(usersService.initiateSelfDelete).toHaveBeenCalledWith(
        'user-1',
        'self@example.com',
      );
      expect(result).toEqual({
        requiresConfirmation: true,
        challengeId: 'chal-3',
      });
      expect(res.status).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException for admin path without users.delete permission', async () => {
      rbac.hasPermission.mockResolvedValue(false);

      await expect(
        controller.remove('user-2', { user: selfUser } as any, res as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when the admin target does not exist', async () => {
      rbac.hasPermission.mockResolvedValue(true);
      usersService.findById.mockResolvedValue(null);

      await expect(
        controller.remove('user-2', { user: selfUser } as any, res as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('deletes immediately and sets 204 for the admin path', async () => {
      rbac.hasPermission.mockResolvedValue(true);
      usersService.findById.mockResolvedValue(otherUser);
      usersService.remove.mockResolvedValue(undefined);

      await controller.remove('user-2', { user: selfUser } as any, res as any);

      expect(usersService.remove).toHaveBeenCalledWith('user-2');
      expect(res.status).toHaveBeenCalledWith(204);
    });
  });

  describe('confirmDeleteOtp / confirmDeleteLink', () => {
    it('throws ForbiddenException when not self (otp)', async () => {
      await expect(
        controller.confirmDeleteOtp(
          'user-2',
          { user: selfUser } as any,
          { challengeId: 'chal-3', code: '333333' },
          res as any,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('confirms deletion via otp and clears cookies', async () => {
      usersService.confirmSelfDelete.mockResolvedValue(undefined);

      const result = await controller.confirmDeleteOtp(
        'user-1',
        { user: selfUser } as any,
        { challengeId: 'chal-3', code: '333333' },
        res as any,
      );

      expect(usersService.confirmSelfDelete).toHaveBeenCalledWith(
        'user-1',
        'chal-3',
        '333333',
      );
      expect(res.clearCookie).toHaveBeenCalledWith('access_token', {
        path: '/',
      });
      expect(res.clearCookie).toHaveBeenCalledWith('refresh_token', {
        path: '/',
      });
      expect(result).toEqual({ success: true });
    });

    it('throws ForbiddenException when not self (link)', async () => {
      await expect(
        controller.confirmDeleteLink(
          'user-2',
          { user: selfUser } as any,
          { challengeId: 'chal-3', token: 'tok-3' },
          res as any,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('confirms deletion via link and clears cookies', async () => {
      usersService.confirmSelfDelete.mockResolvedValue(undefined);

      const result = await controller.confirmDeleteLink(
        'user-1',
        { user: selfUser } as any,
        { challengeId: 'chal-3', token: 'tok-3' },
        res as any,
      );

      expect(usersService.confirmSelfDelete).toHaveBeenCalledWith(
        'user-1',
        'chal-3',
        'tok-3',
      );
      expect(res.clearCookie).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ success: true });
    });
  });
});
