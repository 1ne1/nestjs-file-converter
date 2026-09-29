import { UnauthorizedException } from '@nestjs/common';

import { UserStatus } from '@/generated/prisma/client';

import { JwtAuthGuard } from './jwt-auth.guard';

function makeContext(cookies: Record<string, string>) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ cookies }),
    }),
  } as any;
}

describe('JwtAuthGuard', () => {
  let jwt: any;
  let config: any;
  let users: any;
  let guard: JwtAuthGuard;

  beforeEach(() => {
    jwt = { verifyAsync: jest.fn() };
    config = { get: jest.fn().mockReturnValue('access-secret') };
    users = { findById: jest.fn() };
    guard = new JwtAuthGuard(jwt, config, users);
  });

  it('throws UnauthorizedException when the access token cookie is missing', async () => {
    const context = makeContext({});

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(jwt.verifyAsync).not.toHaveBeenCalled();
  });

  it('throws UnauthorizedException when the token fails verification', async () => {
    jwt.verifyAsync.mockRejectedValue(new Error('invalid'));
    const context = makeContext({ access_token: 'bad-token' });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException when the user does not exist', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: 'user-1' });
    users.findById.mockResolvedValue(null);
    const context = makeContext({ access_token: 'good-token' });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException when the user is blocked', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: 'user-1' });
    users.findById.mockResolvedValue({
      id: 'user-1',
      email: 'a@example.com',
      status: UserStatus.BLOCKED,
    });
    const context = makeContext({ access_token: 'good-token' });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException when the user is deleted', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: 'user-1' });
    users.findById.mockResolvedValue({
      id: 'user-1',
      email: 'a@example.com',
      status: UserStatus.DELETED,
    });
    const context = makeContext({ access_token: 'good-token' });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('sets request.user and allows the request through for an active user', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: 'user-1' });
    users.findById.mockResolvedValue({
      id: 'user-1',
      email: 'a@example.com',
      status: UserStatus.ACTIVE,
    });
    const request: any = { cookies: { access_token: 'good-token' } };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as any;

    expect(await guard.canActivate(context)).toBe(true);
    expect(request.user).toEqual({ id: 'user-1', email: 'a@example.com' });
  });

  it('passes the configured access secret to verifyAsync', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: 'user-1' });
    users.findById.mockResolvedValue({
      id: 'user-1',
      email: 'a@example.com',
      status: UserStatus.ACTIVE,
    });
    const context = makeContext({ access_token: 'good-token' });

    await guard.canActivate(context);

    expect(jwt.verifyAsync).toHaveBeenCalledWith('good-token', {
      secret: 'access-secret',
    });
  });
});
