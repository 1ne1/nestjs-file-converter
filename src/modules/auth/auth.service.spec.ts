import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';

import {
  ChallengeMethod,
  ChallengePurpose,
  UserStatus,
} from '@/generated/prisma/client';

import { AuthService } from './auth.service';

jest.mock('argon2');

const mockedArgon2 = argon2 as jest.Mocked<typeof argon2>;

describe('AuthService', () => {
  let service: AuthService;
  let users: { findByEmail: jest.Mock; findById: jest.Mock; create: jest.Mock };
  let jwt: { sign: jest.Mock; verifyAsync: jest.Mock };
  let config: { get: jest.Mock };
  let challenges: { create: jest.Mock; verify: jest.Mock };
  let mail: { sendMail: jest.Mock };

  const configDefaults: Record<string, unknown> = {
    REGISTRATION_EMAIL_CONFIRMATION_ENABLED: false,
    REGISTRATION_CONFIRMATION_METHOD: 'OTP',
    LOGIN_EMAIL_CONFIRMATION_ENABLED: false,
    LOGIN_CONFIRMATION_METHOD: 'OTP',
    JWT_ACCESS_SECRET: 'access-secret',
    JWT_REFRESH_SECRET: 'refresh-secret',
    APP_BASE_URL: 'http://localhost:3007',
  };

  const buildUser = (overrides: Partial<Record<string, unknown>> = {}) => ({
    id: 'user-1',
    email: 'alice@example.com',
    passwordHash: 'hashed-password',
    name: null,
    status: UserStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(() => {
    users = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
    };
    jwt = {
      sign: jest.fn().mockReturnValue('signed-token'),
      verifyAsync: jest.fn(),
    };
    config = {
      get: jest.fn((key: string) => configDefaults[key]),
    };
    challenges = {
      create: jest.fn(),
      verify: jest.fn(),
    };
    mail = {
      sendMail: jest.fn(),
    };

    mockedArgon2.hash.mockResolvedValue('hashed-password');
    mockedArgon2.verify.mockResolvedValue(true);

    service = new AuthService(
      users as any,
      jwt as any,
      config as any,
      challenges as any,
      mail as any,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('throws ConflictException when the email is already registered', async () => {
      users.findByEmail.mockResolvedValue(buildUser());

      await expect(
        service.register({
          email: 'alice@example.com',
          password: 'Password123!',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('creates the user and issues tokens when confirmation is disabled', async () => {
      users.findByEmail.mockResolvedValue(null);
      const createdUser = buildUser();
      users.create.mockResolvedValue(createdUser);

      const result = await service.register({
        email: 'alice@example.com',
        password: 'Password123!',
      });

      expect(users.create).toHaveBeenCalledWith(
        'alice@example.com',
        'hashed-password',
      );
      expect(result.requiresConfirmation).toBe(false);
      if (!result.requiresConfirmation) {
        expect(result.user).toBe(createdUser);
        expect(result.tokens.accessToken).toBe('signed-token');
        expect(result.tokens.refreshToken).toBe('signed-token');
      }
      expect(challenges.create).not.toHaveBeenCalled();
    });

    it('creates a REGISTRATION challenge and sends an OTP email when confirmation is enabled', async () => {
      config.get.mockImplementation((key: string) =>
        key === 'REGISTRATION_EMAIL_CONFIRMATION_ENABLED'
          ? true
          : key === 'REGISTRATION_CONFIRMATION_METHOD'
            ? ChallengeMethod.OTP
            : configDefaults[key],
      );
      users.findByEmail.mockResolvedValue(null);
      challenges.create.mockResolvedValue({
        challengeId: 'chal-1',
        secret: '123456',
      });

      const result = await service.register({
        email: 'alice@example.com',
        password: 'Password123!',
      });

      expect(challenges.create).toHaveBeenCalledWith({
        purpose: ChallengePurpose.REGISTRATION,
        method: ChallengeMethod.OTP,
        email: 'alice@example.com',
        metadata: { passwordHash: 'hashed-password' },
      });
      expect(mail.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'alice@example.com',
          subject: 'Confirm your registration',
          text: expect.stringContaining('123456'),
        }),
      );
      expect(result).toEqual({
        requiresConfirmation: true,
        challengeId: 'chal-1',
      });
      expect(users.create).not.toHaveBeenCalled();
    });

    it('sends a magic link email when the confirmation method is MAGIC_LINK', async () => {
      config.get.mockImplementation((key: string) =>
        key === 'REGISTRATION_EMAIL_CONFIRMATION_ENABLED'
          ? true
          : key === 'REGISTRATION_CONFIRMATION_METHOD'
            ? ChallengeMethod.MAGIC_LINK
            : configDefaults[key],
      );
      users.findByEmail.mockResolvedValue(null);
      challenges.create.mockResolvedValue({
        challengeId: 'chal-1',
        secret: 'tok123',
      });

      await service.register({
        email: 'alice@example.com',
        password: 'Password123!',
      });

      expect(mail.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining(
            'http://localhost:3007/auth/register/confirm?challengeId=chal-1&token=tok123',
          ),
        }),
      );
    });
  });

  describe('confirmRegistration', () => {
    it('throws BadRequestException when the challenge purpose is not REGISTRATION', async () => {
      challenges.verify.mockResolvedValue({
        purpose: ChallengePurpose.LOGIN,
        email: 'alice@example.com',
        metadata: { passwordHash: 'hashed-password' },
      });

      await expect(
        service.confirmRegistration('chal-1', '123456'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when metadata is missing a passwordHash', async () => {
      challenges.verify.mockResolvedValue({
        purpose: ChallengePurpose.REGISTRATION,
        email: 'alice@example.com',
        metadata: null,
      });

      await expect(
        service.confirmRegistration('chal-1', '123456'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException when the email became registered during the pending period', async () => {
      challenges.verify.mockResolvedValue({
        purpose: ChallengePurpose.REGISTRATION,
        email: 'alice@example.com',
        metadata: { passwordHash: 'hashed-password' },
      });
      users.findByEmail.mockResolvedValue(buildUser());

      await expect(
        service.confirmRegistration('chal-1', '123456'),
      ).rejects.toThrow(ConflictException);
    });

    it('creates the user and issues tokens on success', async () => {
      challenges.verify.mockResolvedValue({
        purpose: ChallengePurpose.REGISTRATION,
        email: 'alice@example.com',
        metadata: { passwordHash: 'hashed-password' },
      });
      users.findByEmail.mockResolvedValue(null);
      const createdUser = buildUser();
      users.create.mockResolvedValue(createdUser);

      const result = await service.confirmRegistration('chal-1', '123456');

      expect(users.create).toHaveBeenCalledWith(
        'alice@example.com',
        'hashed-password',
      );
      expect(result.user).toBe(createdUser);
      expect(result.tokens.accessToken).toBe('signed-token');
    });
  });

  describe('login', () => {
    it('throws UnauthorizedException when the user does not exist', async () => {
      users.findByEmail.mockResolvedValue(null);

      await expect(
        service.login({ email: 'missing@example.com', password: 'whatever' }),
      ).rejects.toThrow(UnauthorizedException);
      expect(mockedArgon2.verify).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException when the password does not match', async () => {
      users.findByEmail.mockResolvedValue(buildUser());
      mockedArgon2.verify.mockResolvedValue(false);

      await expect(
        service.login({ email: 'alice@example.com', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when the account is blocked', async () => {
      users.findByEmail.mockResolvedValue(
        buildUser({ status: UserStatus.BLOCKED }),
      );

      await expect(
        service.login({ email: 'alice@example.com', password: 'Password123!' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('issues tokens directly when confirmation is disabled', async () => {
      const user = buildUser();
      users.findByEmail.mockResolvedValue(user);

      const result = await service.login({
        email: 'alice@example.com',
        password: 'Password123!',
      });

      expect(result.requiresConfirmation).toBe(false);
      if (!result.requiresConfirmation) {
        expect(result.user).toBe(user);
      }
      expect(challenges.create).not.toHaveBeenCalled();
    });

    it('creates a LOGIN challenge and sends an email when confirmation is enabled', async () => {
      config.get.mockImplementation((key: string) =>
        key === 'LOGIN_EMAIL_CONFIRMATION_ENABLED'
          ? true
          : key === 'LOGIN_CONFIRMATION_METHOD'
            ? ChallengeMethod.OTP
            : configDefaults[key],
      );
      const user = buildUser();
      users.findByEmail.mockResolvedValue(user);
      challenges.create.mockResolvedValue({
        challengeId: 'chal-2',
        secret: '654321',
      });

      const result = await service.login({
        email: 'alice@example.com',
        password: 'Password123!',
      });

      expect(challenges.create).toHaveBeenCalledWith({
        purpose: ChallengePurpose.LOGIN,
        method: ChallengeMethod.OTP,
        email: 'alice@example.com',
        userId: 'user-1',
      });
      expect(mail.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({ subject: 'Confirm your login' }),
      );
      expect(result).toEqual({
        requiresConfirmation: true,
        challengeId: 'chal-2',
      });
    });
  });

  describe('confirmLogin', () => {
    it('throws BadRequestException when the challenge purpose is not LOGIN', async () => {
      challenges.verify.mockResolvedValue({
        purpose: ChallengePurpose.REGISTRATION,
        userId: 'user-1',
      });

      await expect(service.confirmLogin('chal-1', '123456')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when the challenge has no userId', async () => {
      challenges.verify.mockResolvedValue({
        purpose: ChallengePurpose.LOGIN,
        userId: null,
      });

      await expect(service.confirmLogin('chal-1', '123456')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws UnauthorizedException when the user no longer exists or is not active', async () => {
      challenges.verify.mockResolvedValue({
        purpose: ChallengePurpose.LOGIN,
        userId: 'user-1',
      });
      users.findById.mockResolvedValue(null);

      await expect(service.confirmLogin('chal-1', '123456')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException when the user is blocked', async () => {
      challenges.verify.mockResolvedValue({
        purpose: ChallengePurpose.LOGIN,
        userId: 'user-1',
      });
      users.findById.mockResolvedValue(
        buildUser({ status: UserStatus.BLOCKED }),
      );

      await expect(service.confirmLogin('chal-1', '123456')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('issues tokens on success', async () => {
      challenges.verify.mockResolvedValue({
        purpose: ChallengePurpose.LOGIN,
        userId: 'user-1',
      });
      const user = buildUser();
      users.findById.mockResolvedValue(user);

      const result = await service.confirmLogin('chal-1', '123456');

      expect(result.user).toBe(user);
      expect(result.tokens.accessToken).toBe('signed-token');
    });
  });

  describe('refresh', () => {
    it('throws UnauthorizedException when no refresh token is provided', async () => {
      await expect(service.refresh(undefined)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException when the token fails verification', async () => {
      jwt.verifyAsync.mockRejectedValue(new Error('invalid'));

      await expect(service.refresh('bad-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException when the user is not active', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: 'user-1' });
      users.findById.mockResolvedValue(
        buildUser({ status: UserStatus.DELETED }),
      );

      await expect(service.refresh('good-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException when the user no longer exists', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: 'user-1' });
      users.findById.mockResolvedValue(null);

      await expect(service.refresh('good-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('issues new tokens on success', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: 'user-1' });
      users.findById.mockResolvedValue(buildUser());

      const tokens = await service.refresh('good-token');

      expect(tokens.accessToken).toBe('signed-token');
      expect(tokens.refreshToken).toBe('signed-token');
    });
  });
});
