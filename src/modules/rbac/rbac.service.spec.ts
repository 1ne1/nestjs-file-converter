import { RbacService } from './rbac.service';

describe('RbacService', () => {
  let prisma: any;
  let service: RbacService;

  beforeEach(() => {
    prisma = {
      role: { findMany: jest.fn() },
      userRole: { findMany: jest.fn() },
    };
    service = new RbacService(prisma);
  });

  describe('onModuleInit', () => {
    it('reloads the cache on init', async () => {
      prisma.role.findMany.mockResolvedValue([]);
      const reloadSpy = jest.spyOn(service, 'reload');

      await service.onModuleInit();

      expect(reloadSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('reload', () => {
    it('populates the cache from prisma data, treating an empty actions array as null', async () => {
      prisma.role.findMany.mockResolvedValue([
        {
          name: 'admin',
          permissions: [
            { actions: [], permission: { name: 'users.read' } },
            { actions: ['update'], permission: { name: 'users.update' } },
          ],
        },
      ]);

      await service.reload();

      expect(service.getPermissionsForRoles(['admin'])).toEqual(
        new Set(['users.read', 'users.update']),
      );
    });

    it('results in an empty cache when there are no roles', async () => {
      prisma.role.findMany.mockResolvedValue([]);

      await service.reload();

      expect(service.getPermissionsForRoles(['anything'])).toEqual(new Set());
    });
  });

  describe('getPermissionsForRoles', () => {
    it('returns an empty set for an unknown role', async () => {
      prisma.role.findMany.mockResolvedValue([]);
      await service.reload();

      expect(service.getPermissionsForRoles(['unknown'])).toEqual(new Set());
    });

    it('unions permissions across multiple roles', async () => {
      prisma.role.findMany.mockResolvedValue([
        {
          name: 'a',
          permissions: [{ actions: [], permission: { name: 'p1' } }],
        },
        {
          name: 'b',
          permissions: [{ actions: [], permission: { name: 'p2' } }],
        },
      ]);
      await service.reload();

      expect(service.getPermissionsForRoles(['a', 'b'])).toEqual(
        new Set(['p1', 'p2']),
      );
    });
  });

  describe('getRoleNamesForUser', () => {
    it('maps userRole rows to role names', async () => {
      prisma.userRole.findMany.mockResolvedValue([
        { role: { name: 'admin' } },
        { role: { name: 'editor' } },
      ]);

      const names = await service.getRoleNamesForUser('user-1');

      expect(names).toEqual(['admin', 'editor']);
      expect(prisma.userRole.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        include: { role: true },
      });
    });

    it('returns an empty array when the user has no roles', async () => {
      prisma.userRole.findMany.mockResolvedValue([]);

      expect(await service.getRoleNamesForUser('user-1')).toEqual([]);
    });
  });

  describe('getPermissionsForUser', () => {
    it('combines role lookup with permission lookup', async () => {
      prisma.role.findMany.mockResolvedValue([
        {
          name: 'admin',
          permissions: [{ actions: [], permission: { name: 'p1' } }],
        },
      ]);
      await service.reload();
      prisma.userRole.findMany.mockResolvedValue([{ role: { name: 'admin' } }]);

      expect(await service.getPermissionsForUser('user-1')).toEqual(
        new Set(['p1']),
      );
    });
  });

  describe('hasPermission', () => {
    beforeEach(async () => {
      prisma.role.findMany.mockResolvedValue([
        {
          name: 'admin',
          permissions: [
            { actions: [], permission: { name: 'users.read' } },
            { actions: ['create', 'update'], permission: { name: 'articles' } },
          ],
        },
        {
          name: 'viewer',
          permissions: [{ actions: [], permission: { name: 'reports.view' } }],
        },
      ]);
      await service.reload();
    });

    it('returns false when the user has no roles', async () => {
      prisma.userRole.findMany.mockResolvedValue([]);

      expect(await service.hasPermission('user-1', 'users.read')).toBe(false);
    });

    it('returns false when the permission is not granted to any of the user roles', async () => {
      prisma.userRole.findMany.mockResolvedValue([
        { role: { name: 'viewer' } },
      ]);

      expect(await service.hasPermission('user-1', 'users.read')).toBe(false);
    });

    it('returns false for a role name not present in the cache at all', async () => {
      prisma.userRole.findMany.mockResolvedValue([
        { role: { name: 'ghost-role' } },
      ]);

      expect(await service.hasPermission('user-1', 'users.read')).toBe(false);
    });

    it('returns true when the permission is granted and no action is given, regardless of action scoping', async () => {
      prisma.userRole.findMany.mockResolvedValue([{ role: { name: 'admin' } }]);

      expect(await service.hasPermission('user-1', 'users.read')).toBe(true);
      expect(await service.hasPermission('user-1', 'articles')).toBe(true);
    });

    it('returns true for any action when the grant has an empty actions array (all actions allowed)', async () => {
      prisma.userRole.findMany.mockResolvedValue([{ role: { name: 'admin' } }]);

      expect(
        await service.hasPermission('user-1', 'users.read', 'delete'),
      ).toBe(true);
    });

    it('returns true when the requested action is included in a restricted grant', async () => {
      prisma.userRole.findMany.mockResolvedValue([{ role: { name: 'admin' } }]);

      expect(await service.hasPermission('user-1', 'articles', 'update')).toBe(
        true,
      );
    });

    it('returns false when the requested action is excluded from a restricted grant', async () => {
      prisma.userRole.findMany.mockResolvedValue([{ role: { name: 'admin' } }]);

      expect(await service.hasPermission('user-1', 'articles', 'delete')).toBe(
        false,
      );
    });

    it('grants access if any of the user roles matches, even when others do not', async () => {
      prisma.userRole.findMany.mockResolvedValue([
        { role: { name: 'viewer' } },
        { role: { name: 'admin' } },
      ]);

      expect(await service.hasPermission('user-1', 'users.read')).toBe(true);
    });
  });
});
