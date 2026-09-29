import { AuthController } from './auth.controller';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: {
    register: jest.Mock;
    confirmRegistration: jest.Mock;
    login: jest.Mock;
    confirmLogin: jest.Mock;
    refresh: jest.Mock;
  };
  let config: { get: jest.Mock };
  let res: { setCookie: jest.Mock; clearCookie: jest.Mock };

  const tokens = { accessToken: 'access-token', refreshToken: 'refresh-token' };

  beforeEach(() => {
    authService = {
      register: jest.fn(),
      confirmRegistration: jest.fn(),
      login: jest.fn(),
      confirmLogin: jest.fn(),
      refresh: jest.fn(),
    };
    config = { get: jest.fn().mockReturnValue('development') };
    res = { setCookie: jest.fn(), clearCookie: jest.fn() };

    controller = new AuthController(authService as any, config as any);
  });

  describe('register', () => {
    it('returns requiresConfirmation without setting cookies when confirmation is required', async () => {
      authService.register.mockResolvedValue({
        requiresConfirmation: true,
        challengeId: 'chal-1',
      });

      const result = await controller.register(
        { email: 'a@example.com', password: 'Password123!' },
        res as any,
      );

      expect(result).toEqual({
        requiresConfirmation: true,
        challengeId: 'chal-1',
      });
      expect(res.setCookie).not.toHaveBeenCalled();
    });

    it('sets cookies and returns the user when confirmation is not required', async () => {
      authService.register.mockResolvedValue({
        requiresConfirmation: false,
        user: { id: 'user-1', email: 'a@example.com' },
        tokens,
      });

      const result = await controller.register(
        { email: 'a@example.com', password: 'Password123!' },
        res as any,
      );

      expect(result).toEqual({ id: 'user-1', email: 'a@example.com' });
      expect(res.setCookie).toHaveBeenCalledWith(
        'access_token',
        'access-token',
        expect.objectContaining({ httpOnly: true }),
      );
      expect(res.setCookie).toHaveBeenCalledWith(
        'refresh_token',
        'refresh-token',
        expect.objectContaining({ httpOnly: true }),
      );
    });
  });

  describe('confirmRegistrationOtp', () => {
    it('delegates to authService.confirmRegistration and sets cookies', async () => {
      authService.confirmRegistration.mockResolvedValue({
        user: { id: 'user-1', email: 'a@example.com' },
        tokens,
      });

      const result = await controller.confirmRegistrationOtp(
        { challengeId: 'chal-1', code: '123456' },
        res as any,
      );

      expect(authService.confirmRegistration).toHaveBeenCalledWith(
        'chal-1',
        '123456',
      );
      expect(result).toEqual({ id: 'user-1', email: 'a@example.com' });
      expect(res.setCookie).toHaveBeenCalledTimes(2);
    });
  });

  describe('confirmRegistrationLink', () => {
    it('delegates to authService.confirmRegistration with the token and sets cookies', async () => {
      authService.confirmRegistration.mockResolvedValue({
        user: { id: 'user-1', email: 'a@example.com' },
        tokens,
      });

      const result = await controller.confirmRegistrationLink(
        { challengeId: 'chal-1', token: 'tok-1' },
        res as any,
      );

      expect(authService.confirmRegistration).toHaveBeenCalledWith(
        'chal-1',
        'tok-1',
      );
      expect(result).toEqual({ id: 'user-1', email: 'a@example.com' });
      expect(res.setCookie).toHaveBeenCalledTimes(2);
    });
  });

  describe('login', () => {
    it('returns requiresConfirmation without setting cookies when confirmation is required', async () => {
      authService.login.mockResolvedValue({
        requiresConfirmation: true,
        challengeId: 'chal-2',
      });

      const result = await controller.login(
        { email: 'a@example.com', password: 'Password123!' },
        res as any,
      );

      expect(result).toEqual({
        requiresConfirmation: true,
        challengeId: 'chal-2',
      });
      expect(res.setCookie).not.toHaveBeenCalled();
    });

    it('sets cookies and returns the user when confirmation is not required', async () => {
      authService.login.mockResolvedValue({
        requiresConfirmation: false,
        user: { id: 'user-1', email: 'a@example.com' },
        tokens,
      });

      const result = await controller.login(
        { email: 'a@example.com', password: 'Password123!' },
        res as any,
      );

      expect(result).toEqual({ id: 'user-1', email: 'a@example.com' });
      expect(res.setCookie).toHaveBeenCalledTimes(2);
    });
  });

  describe('confirmLoginOtp', () => {
    it('delegates to authService.confirmLogin and sets cookies', async () => {
      authService.confirmLogin.mockResolvedValue({
        user: { id: 'user-1', email: 'a@example.com' },
        tokens,
      });

      const result = await controller.confirmLoginOtp(
        { challengeId: 'chal-2', code: '654321' },
        res as any,
      );

      expect(authService.confirmLogin).toHaveBeenCalledWith('chal-2', '654321');
      expect(result).toEqual({ id: 'user-1', email: 'a@example.com' });
    });
  });

  describe('confirmLoginLink', () => {
    it('delegates to authService.confirmLogin with the token and sets cookies', async () => {
      authService.confirmLogin.mockResolvedValue({
        user: { id: 'user-1', email: 'a@example.com' },
        tokens,
      });

      const result = await controller.confirmLoginLink(
        { challengeId: 'chal-2', token: 'tok-2' },
        res as any,
      );

      expect(authService.confirmLogin).toHaveBeenCalledWith('chal-2', 'tok-2');
      expect(result).toEqual({ id: 'user-1', email: 'a@example.com' });
    });
  });

  describe('refresh', () => {
    it('reads the refresh_token cookie, issues new cookies, and returns success', async () => {
      authService.refresh.mockResolvedValue(tokens);
      const req = { cookies: { refresh_token: 'old-refresh' } };

      const result = await controller.refresh(req as any, res as any);

      expect(authService.refresh).toHaveBeenCalledWith('old-refresh');
      expect(result).toEqual({ success: true });
      expect(res.setCookie).toHaveBeenCalledTimes(2);
    });
  });

  describe('logout', () => {
    it('clears both auth cookies and returns success', () => {
      const result = controller.logout(res as any);

      expect(res.clearCookie).toHaveBeenCalledWith('access_token', {
        path: '/',
      });
      expect(res.clearCookie).toHaveBeenCalledWith('refresh_token', {
        path: '/',
      });
      expect(result).toEqual({ success: true });
    });
  });

  describe('me', () => {
    it('returns req.user', () => {
      const req = { user: { id: 'user-1', email: 'a@example.com' } };

      expect(controller.me(req as any)).toBe(req.user);
    });
  });
});
