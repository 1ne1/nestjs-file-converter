import { ForbiddenException } from '@nestjs/common';

import type { AuthenticatedRequest } from '@/core/auth/jwt-auth.guard';

import { RbacAdminController } from './rbac-admin.controller';

describe('RbacAdminController', () => {
  let controller: RbacAdminController;
  let rbacAdmin: {
    listRoles: jest.Mock;
    createRole: jest.Mock;
    updateRole: jest.Mock;
    deleteRole: jest.Mock;
    listPermissions: jest.Mock;
    createPermission: jest.Mock;
    updatePermission: jest.Mock;
    deletePermission: jest.Mock;
    listGrants: jest.Mock;
    createGrant: jest.Mock;
    updateGrant: jest.Mock;
    deleteGrant: jest.Mock;
  };
  let rbac: { hasPermission: jest.Mock };
  let req: AuthenticatedRequest;

  beforeEach(() => {
    rbacAdmin = {
      listRoles: jest.fn(),
      createRole: jest.fn(),
      updateRole: jest.fn(),
      deleteRole: jest.fn(),
      listPermissions: jest.fn(),
      createPermission: jest.fn(),
      updatePermission: jest.fn(),
      deletePermission: jest.fn(),
      listGrants: jest.fn(),
      createGrant: jest.fn(),
      updateGrant: jest.fn(),
      deleteGrant: jest.fn(),
    };
    rbac = { hasPermission: jest.fn().mockResolvedValue(true) };
    req = {
      user: { id: 'user-1', email: 'user1@example.com' },
    } as AuthenticatedRequest;

    controller = new RbacAdminController(rbacAdmin as never, rbac as never);
  });

  it('throws ForbiddenException when the caller lacks rbac.manage', async () => {
    rbac.hasPermission.mockResolvedValue(false);

    await expect(controller.listRoles(req)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(rbacAdmin.listRoles).not.toHaveBeenCalled();
    expect(rbac.hasPermission).toHaveBeenCalledWith('user-1', 'rbac.manage');
  });

  describe('roles', () => {
    it('lists roles', async () => {
      rbacAdmin.listRoles.mockResolvedValue(['role']);
      await expect(controller.listRoles(req)).resolves.toEqual(['role']);
      expect(rbacAdmin.listRoles).toHaveBeenCalled();
    });

    it('creates a role', async () => {
      const dto = { name: 'admin' };
      rbacAdmin.createRole.mockResolvedValue({ id: 'role-1', ...dto });

      await expect(controller.createRole(req, dto as never)).resolves.toEqual({
        id: 'role-1',
        ...dto,
      });
      expect(rbacAdmin.createRole).toHaveBeenCalledWith('user-1', dto);
    });

    it('updates a role', async () => {
      const dto = { name: 'renamed' };
      rbacAdmin.updateRole.mockResolvedValue({ id: 'role-1', ...dto });

      await expect(
        controller.updateRole(req, 'role-1', dto as never),
      ).resolves.toEqual({ id: 'role-1', ...dto });
      expect(rbacAdmin.updateRole).toHaveBeenCalledWith(
        'user-1',
        'role-1',
        dto,
      );
    });

    it('deletes a role', async () => {
      rbacAdmin.deleteRole.mockResolvedValue(undefined);
      await controller.deleteRole(req, 'role-1');
      expect(rbacAdmin.deleteRole).toHaveBeenCalledWith('user-1', 'role-1');
    });
  });

  describe('permissions', () => {
    it('lists permissions', async () => {
      rbacAdmin.listPermissions.mockResolvedValue(['permission']);
      await expect(controller.listPermissions(req)).resolves.toEqual([
        'permission',
      ]);
      expect(rbacAdmin.listPermissions).toHaveBeenCalled();
    });

    it('creates a permission', async () => {
      const dto = { name: 'users.read', actions: [] };
      rbacAdmin.createPermission.mockResolvedValue({ id: 'perm-1', ...dto });

      await expect(
        controller.createPermission(req, dto as never),
      ).resolves.toEqual({ id: 'perm-1', ...dto });
      expect(rbacAdmin.createPermission).toHaveBeenCalledWith('user-1', dto);
    });

    it('updates a permission', async () => {
      const dto = { actions: ['read'] };
      rbacAdmin.updatePermission.mockResolvedValue({ id: 'perm-1', ...dto });

      await expect(
        controller.updatePermission(req, 'perm-1', dto as never),
      ).resolves.toEqual({ id: 'perm-1', ...dto });
      expect(rbacAdmin.updatePermission).toHaveBeenCalledWith(
        'user-1',
        'perm-1',
        dto,
      );
    });

    it('deletes a permission', async () => {
      rbacAdmin.deletePermission.mockResolvedValue(undefined);
      await controller.deletePermission(req, 'perm-1');
      expect(rbacAdmin.deletePermission).toHaveBeenCalledWith(
        'user-1',
        'perm-1',
      );
    });
  });

  describe('grants', () => {
    it('lists grants', async () => {
      rbacAdmin.listGrants.mockResolvedValue(['grant']);
      await expect(controller.listGrants(req)).resolves.toEqual(['grant']);
      expect(rbacAdmin.listGrants).toHaveBeenCalled();
    });

    it('creates a grant', async () => {
      const dto = { roleId: 'role-1', permissionId: 'perm-1', actions: [] };
      rbacAdmin.createGrant.mockResolvedValue({ id: 'grant-1', ...dto });

      await expect(controller.createGrant(req, dto as never)).resolves.toEqual({
        id: 'grant-1',
        ...dto,
      });
      expect(rbacAdmin.createGrant).toHaveBeenCalledWith('user-1', dto);
    });

    it('updates a grant', async () => {
      const dto = { actions: ['update'] };
      rbacAdmin.updateGrant.mockResolvedValue({ id: 'grant-1', ...dto });

      await expect(
        controller.updateGrant(req, 'grant-1', dto as never),
      ).resolves.toEqual({ id: 'grant-1', ...dto });
      expect(rbacAdmin.updateGrant).toHaveBeenCalledWith(
        'user-1',
        'grant-1',
        dto,
      );
    });

    it('deletes a grant', async () => {
      rbacAdmin.deleteGrant.mockResolvedValue(undefined);
      await controller.deleteGrant(req, 'grant-1');
      expect(rbacAdmin.deleteGrant).toHaveBeenCalledWith('user-1', 'grant-1');
    });
  });
});
