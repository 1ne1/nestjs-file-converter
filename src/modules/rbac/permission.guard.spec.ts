import { ForbiddenException } from '@nestjs/common';

import { PermissionGuard } from './permission.guard';

function makeContext(user: { id: string } | undefined) {
  return {
    getHandler: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as any;
}

describe('PermissionGuard', () => {
  let reflector: any;
  let rbac: any;
  let guard: PermissionGuard;

  beforeEach(() => {
    reflector = { get: jest.fn() };
    rbac = { hasPermission: jest.fn() };
    guard = new PermissionGuard(reflector, rbac);
  });

  it('allows the request through when no permission metadata is set', async () => {
    reflector.get.mockReturnValue(undefined);
    const context = makeContext(undefined);

    expect(await guard.canActivate(context)).toBe(true);
    expect(rbac.hasPermission).not.toHaveBeenCalled();
  });

  it('throws ForbiddenException when metadata is set but there is no authenticated user', async () => {
    reflector.get.mockReturnValue('users.read');
    const context = makeContext(undefined);

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
    expect(rbac.hasPermission).not.toHaveBeenCalled();
  });

  it('allows the request through when the permission is granted', async () => {
    reflector.get.mockReturnValue('users.read');
    rbac.hasPermission.mockResolvedValue(true);
    const context = makeContext({ id: 'user-1' });

    expect(await guard.canActivate(context)).toBe(true);
    expect(rbac.hasPermission).toHaveBeenCalledWith('user-1', 'users.read');
  });

  it('throws ForbiddenException when the permission is not granted', async () => {
    reflector.get.mockReturnValue('users.read');
    rbac.hasPermission.mockResolvedValue(false);
    const context = makeContext({ id: 'user-1' });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });
});
