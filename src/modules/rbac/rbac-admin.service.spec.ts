import { ConflictException, NotFoundException } from '@nestjs/common';

import { Prisma } from '@/generated/prisma/client';

import { RbacAdminService } from './rbac-admin.service';

function makeP2002Error() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '7.10.0',
  });
}

describe('RbacAdminService', () => {
  let prisma: any;
  let rbac: any;
  let service: RbacAdminService;

  beforeEach(() => {
    prisma = {
      role: {
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        findUnique: jest.fn(),
      },
      permission: {
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        findUnique: jest.fn(),
      },
      rolePermission: {
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
      },
      userRole: { count: jest.fn() },
    };
    rbac = { reload: jest.fn().mockResolvedValue(undefined) };
    service = new RbacAdminService(prisma, rbac);
  });

  describe('listRoles', () => {
    it('lists roles with their permissions, ordered by name', async () => {
      prisma.role.findMany.mockResolvedValue([{ id: 'r1' }]);

      const result = await service.listRoles();

      expect(result).toEqual([{ id: 'r1' }]);
      expect(prisma.role.findMany).toHaveBeenCalledWith({
        include: { permissions: true },
        orderBy: { name: 'asc' },
      });
    });
  });

  describe('listPermissions', () => {
    it('lists permissions ordered by name', async () => {
      prisma.permission.findMany.mockResolvedValue([{ id: 'p1' }]);

      const result = await service.listPermissions();

      expect(result).toEqual([{ id: 'p1' }]);
      expect(prisma.permission.findMany).toHaveBeenCalledWith({
        orderBy: { name: 'asc' },
      });
    });
  });

  describe('listGrants', () => {
    it('lists grants including role and permission', async () => {
      prisma.rolePermission.findMany.mockResolvedValue([{ id: 'g1' }]);

      const result = await service.listGrants();

      expect(result).toEqual([{ id: 'g1' }]);
      expect(prisma.rolePermission.findMany).toHaveBeenCalledWith({
        include: { role: true, permission: true },
        orderBy: { createdAt: 'asc' },
      });
    });
  });

  describe('createRole', () => {
    it('creates a role and reloads the rbac cache', async () => {
      prisma.role.create.mockResolvedValue({ id: 'r1', name: 'editor' });

      const result = await service.createRole('actor-1', { name: 'editor' });

      expect(result).toEqual({ id: 'r1', name: 'editor' });
      expect(rbac.reload).toHaveBeenCalledTimes(1);
    });

    it('maps a duplicate name to ConflictException without reloading', async () => {
      prisma.role.create.mockRejectedValue(makeP2002Error());

      await expect(
        service.createRole('actor-1', { name: 'editor' }),
      ).rejects.toThrow(ConflictException);
      expect(rbac.reload).not.toHaveBeenCalled();
    });

    it('rethrows unrelated errors', async () => {
      prisma.role.create.mockRejectedValue(new Error('boom'));

      await expect(
        service.createRole('actor-1', { name: 'editor' }),
      ).rejects.toThrow('boom');
    });
  });

  describe('updateRole', () => {
    it('updates an existing role and reloads', async () => {
      prisma.role.findUnique.mockResolvedValue({ id: 'r1' });
      prisma.role.update.mockResolvedValue({ id: 'r1', name: 'new-name' });

      const result = await service.updateRole('actor-1', 'r1', {
        name: 'new-name',
      });

      expect(result).toEqual({ id: 'r1', name: 'new-name' });
      expect(rbac.reload).toHaveBeenCalledTimes(1);
    });

    it('throws NotFoundException when the role does not exist', async () => {
      prisma.role.findUnique.mockResolvedValue(null);

      await expect(
        service.updateRole('actor-1', 'missing', { name: 'x' }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.role.update).not.toHaveBeenCalled();
    });

    it('maps a duplicate name conflict on update', async () => {
      prisma.role.findUnique.mockResolvedValue({ id: 'r1' });
      prisma.role.update.mockRejectedValue(makeP2002Error());

      await expect(
        service.updateRole('actor-1', 'r1', { name: 'dup' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('deleteRole', () => {
    it('deletes a role with no grants or assignments and reloads', async () => {
      prisma.role.findUnique.mockResolvedValue({ id: 'r1' });
      prisma.rolePermission.count.mockResolvedValue(0);
      prisma.userRole.count.mockResolvedValue(0);

      await service.deleteRole('actor-1', 'r1');

      expect(prisma.role.delete).toHaveBeenCalledWith({ where: { id: 'r1' } });
      expect(rbac.reload).toHaveBeenCalledTimes(1);
    });

    it('throws NotFoundException for a missing role', async () => {
      prisma.role.findUnique.mockResolvedValue(null);

      await expect(service.deleteRole('actor-1', 'missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ConflictException when the role still has grants', async () => {
      prisma.role.findUnique.mockResolvedValue({ id: 'r1' });
      prisma.rolePermission.count.mockResolvedValue(2);
      prisma.userRole.count.mockResolvedValue(0);

      await expect(service.deleteRole('actor-1', 'r1')).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.role.delete).not.toHaveBeenCalled();
    });

    it('throws ConflictException when the role still has user assignments', async () => {
      prisma.role.findUnique.mockResolvedValue({ id: 'r1' });
      prisma.rolePermission.count.mockResolvedValue(0);
      prisma.userRole.count.mockResolvedValue(1);

      await expect(service.deleteRole('actor-1', 'r1')).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.role.delete).not.toHaveBeenCalled();
    });
  });

  describe('createPermission', () => {
    it('creates a permission and reloads', async () => {
      prisma.permission.create.mockResolvedValue({
        id: 'p1',
        name: 'articles',
        actions: ['create'],
      });

      const result = await service.createPermission('actor-1', {
        name: 'articles',
        actions: ['create'],
      });

      expect(result.id).toBe('p1');
      expect(rbac.reload).toHaveBeenCalledTimes(1);
    });

    it('maps a duplicate permission name to ConflictException', async () => {
      prisma.permission.create.mockRejectedValue(makeP2002Error());

      await expect(
        service.createPermission('actor-1', { name: 'dup', actions: [] }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('updatePermission', () => {
    it('updates an existing permission and reloads', async () => {
      prisma.permission.findUnique.mockResolvedValue({ id: 'p1' });
      prisma.permission.update.mockResolvedValue({
        id: 'p1',
        name: 'updated',
      });

      const result = await service.updatePermission('actor-1', 'p1', {
        name: 'updated',
      });

      expect(result.name).toBe('updated');
      expect(rbac.reload).toHaveBeenCalledTimes(1);
    });

    it('throws NotFoundException for a missing permission', async () => {
      prisma.permission.findUnique.mockResolvedValue(null);

      await expect(
        service.updatePermission('actor-1', 'missing', {}),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.permission.update).not.toHaveBeenCalled();
    });
  });

  describe('deletePermission', () => {
    it('deletes a permission with no grants and reloads', async () => {
      prisma.permission.findUnique.mockResolvedValue({ id: 'p1' });
      prisma.rolePermission.count.mockResolvedValue(0);

      await service.deletePermission('actor-1', 'p1');

      expect(prisma.permission.delete).toHaveBeenCalledWith({
        where: { id: 'p1' },
      });
      expect(rbac.reload).toHaveBeenCalledTimes(1);
    });

    it('throws NotFoundException for a missing permission', async () => {
      prisma.permission.findUnique.mockResolvedValue(null);

      await expect(
        service.deletePermission('actor-1', 'missing'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when grants still reference it', async () => {
      prisma.permission.findUnique.mockResolvedValue({ id: 'p1' });
      prisma.rolePermission.count.mockResolvedValue(3);

      await expect(service.deletePermission('actor-1', 'p1')).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.permission.delete).not.toHaveBeenCalled();
    });
  });

  describe('createGrant', () => {
    it('creates a grant once role and permission exist, then reloads', async () => {
      prisma.role.findUnique.mockResolvedValue({ id: 'r1' });
      prisma.permission.findUnique.mockResolvedValue({ id: 'p1' });
      prisma.rolePermission.create.mockResolvedValue({
        id: 'g1',
        roleId: 'r1',
        permissionId: 'p1',
        actions: [],
      });

      const result = await service.createGrant('actor-1', {
        roleId: 'r1',
        permissionId: 'p1',
        actions: [],
      });

      expect(result.id).toBe('g1');
      expect(rbac.reload).toHaveBeenCalledTimes(1);
    });

    it('throws NotFoundException when the role does not exist', async () => {
      prisma.role.findUnique.mockResolvedValue(null);

      await expect(
        service.createGrant('actor-1', {
          roleId: 'missing',
          permissionId: 'p1',
          actions: [],
        }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.rolePermission.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the permission does not exist', async () => {
      prisma.role.findUnique.mockResolvedValue({ id: 'r1' });
      prisma.permission.findUnique.mockResolvedValue(null);

      await expect(
        service.createGrant('actor-1', {
          roleId: 'r1',
          permissionId: 'missing',
          actions: [],
        }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.rolePermission.create).not.toHaveBeenCalled();
    });

    it('maps a duplicate grant to ConflictException without reloading', async () => {
      prisma.role.findUnique.mockResolvedValue({ id: 'r1' });
      prisma.permission.findUnique.mockResolvedValue({ id: 'p1' });
      prisma.rolePermission.create.mockRejectedValue(makeP2002Error());

      await expect(
        service.createGrant('actor-1', {
          roleId: 'r1',
          permissionId: 'p1',
          actions: [],
        }),
      ).rejects.toThrow(ConflictException);
      expect(rbac.reload).not.toHaveBeenCalled();
    });

    it('rethrows unrelated errors from grant creation', async () => {
      prisma.role.findUnique.mockResolvedValue({ id: 'r1' });
      prisma.permission.findUnique.mockResolvedValue({ id: 'p1' });
      prisma.rolePermission.create.mockRejectedValue(new Error('boom'));

      await expect(
        service.createGrant('actor-1', {
          roleId: 'r1',
          permissionId: 'p1',
          actions: [],
        }),
      ).rejects.toThrow('boom');
    });
  });

  describe('updateGrant', () => {
    it('updates an existing grant and reloads', async () => {
      prisma.rolePermission.findUnique.mockResolvedValue({ id: 'g1' });
      prisma.rolePermission.update.mockResolvedValue({
        id: 'g1',
        actions: ['update'],
      });

      const result = await service.updateGrant('actor-1', 'g1', {
        actions: ['update'],
      });

      expect(result.actions).toEqual(['update']);
      expect(rbac.reload).toHaveBeenCalledTimes(1);
    });

    it('throws NotFoundException for a missing grant', async () => {
      prisma.rolePermission.findUnique.mockResolvedValue(null);

      await expect(
        service.updateGrant('actor-1', 'missing', { actions: [] }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.rolePermission.update).not.toHaveBeenCalled();
    });
  });

  describe('deleteGrant', () => {
    it('deletes an existing grant and reloads', async () => {
      prisma.rolePermission.findUnique.mockResolvedValue({ id: 'g1' });

      await service.deleteGrant('actor-1', 'g1');

      expect(prisma.rolePermission.delete).toHaveBeenCalledWith({
        where: { id: 'g1' },
      });
      expect(rbac.reload).toHaveBeenCalledTimes(1);
    });

    it('throws NotFoundException for a missing grant', async () => {
      prisma.rolePermission.findUnique.mockResolvedValue(null);

      await expect(service.deleteGrant('actor-1', 'missing')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.rolePermission.delete).not.toHaveBeenCalled();
    });
  });
});
