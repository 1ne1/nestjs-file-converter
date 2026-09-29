import { BadRequestException, ConflictException } from '@nestjs/common';
import * as argon2 from 'argon2';

import {
  ChallengeMethod,
  ChallengePurpose,
  Prisma,
  UserStatus,
} from '@/generated/prisma/client';

import { UsersService } from './users.service';

jest.mock('argon2');

const mockedArgon2 = argon2 as jest.Mocked<typeof argon2>;

function makeP2002() {
  return Object.assign(
    Object.create(Prisma.PrismaClientKnownRequestError.prototype),
    {
      code: 'P2002',
      message: 'Unique constraint failed',
    },
  );
}

function makeP2025() {
  return Object.assign(
    Object.create(Prisma.PrismaClientKnownRequestError.prototype),
    {
      code: 'P2025',
      message: 'Record not found',
    },
  );
}

describe('UsersService', () => {
  let service: UsersService;
  let prisma: {
    user: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      findMany: jest.Mock;
    };
    userRole: { deleteMany: jest.Mock };
  };
  let challenges: { create: jest.Mock; verify: jest.Mock };
  let mail: { sendMail: jest.Mock };

  const buildUser = (overrides: Partial<Record<string, unknown>> = {}) => ({
    id: 'user-1',
    email: 'alice@example.com',
    passwordHash: 'hashed',
    name: null,
    status: UserStatus.ACTIVE,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    ...overrides,
  });

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
      },
      userRole: { deleteMany: jest.fn() },
    };
    challenges = { create: jest.fn(), verify: jest.fn() };
    mail = { sendMail: jest.fn() };

    mockedArgon2.hash.mockResolvedValue('random-hash');

    service = new UsersService(prisma as any, challenges as any, mail as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('update', () => {
    it('updates the user and returns it', async () => {
      const updated = buildUser({ name: 'Alice' });
      prisma.user.update.mockResolvedValue(updated);

      const result = await service.update('user-1', { name: 'Alice' });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { name: 'Alice' },
      });
      expect(result).toBe(updated);
    });

    it('maps a P2002 error to ConflictException', async () => {
      prisma.user.update.mockRejectedValue(makeP2002());

      await expect(
        service.update('user-1', { email: 'taken@example.com' }),
      ).rejects.toThrow(ConflictException);
    });

    it('rethrows unrelated errors', async () => {
      prisma.user.update.mockRejectedValue(new Error('boom'));

      await expect(service.update('user-1', { name: 'Alice' })).rejects.toThrow(
        'boom',
      );
    });
  });

  describe('initiateEmailChange', () => {
    it('throws ConflictException when the new email is already taken', async () => {
      prisma.user.findUnique.mockResolvedValue(
        buildUser({ email: 'taken@example.com' }),
      );

      await expect(
        service.initiateEmailChange('user-1', 'taken@example.com'),
      ).rejects.toThrow(ConflictException);
    });

    it('creates an EMAIL_CHANGE challenge addressed to the new email and sends the code', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      challenges.create.mockResolvedValue({
        challengeId: 'chal-1',
        secret: '111111',
      });

      const result = await service.initiateEmailChange(
        'user-1',
        'new@example.com',
      );

      expect(challenges.create).toHaveBeenCalledWith({
        purpose: ChallengePurpose.EMAIL_CHANGE,
        method: ChallengeMethod.OTP,
        email: 'new@example.com',
        userId: 'user-1',
      });
      expect(mail.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'new@example.com',
          text: expect.stringContaining('111111'),
        }),
      );
      expect(result).toEqual({ challengeId: 'chal-1' });
    });
  });

  describe('confirmEmailChange', () => {
    it('throws BadRequestException when the challenge purpose is wrong', async () => {
      challenges.verify.mockResolvedValue({
        purpose: ChallengePurpose.REGISTRATION,
        userId: 'user-1',
        email: 'new@example.com',
      });

      await expect(
        service.confirmEmailChange('user-1', 'chal-1', '111111'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when the challenge belongs to a different user', async () => {
      challenges.verify.mockResolvedValue({
        purpose: ChallengePurpose.EMAIL_CHANGE,
        userId: 'someone-else',
        email: 'new@example.com',
      });

      await expect(
        service.confirmEmailChange('user-1', 'chal-1', '111111'),
      ).rejects.toThrow(BadRequestException);
    });

    it('applies the email change on success', async () => {
      challenges.verify.mockResolvedValue({
        purpose: ChallengePurpose.EMAIL_CHANGE,
        userId: 'user-1',
        email: 'new@example.com',
      });
      const updated = buildUser({ email: 'new@example.com' });
      prisma.user.update.mockResolvedValue(updated);

      const result = await service.confirmEmailChange(
        'user-1',
        'chal-1',
        '111111',
      );

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { email: 'new@example.com' },
      });
      expect(result).toBe(updated);
    });
  });

  describe('initiateSelfDelete', () => {
    it('creates a SELF_DELETE challenge and sends a code to the account email', async () => {
      challenges.create.mockResolvedValue({
        challengeId: 'chal-2',
        secret: '222222',
      });

      const result = await service.initiateSelfDelete(
        'user-1',
        'alice@example.com',
      );

      expect(challenges.create).toHaveBeenCalledWith({
        purpose: ChallengePurpose.SELF_DELETE,
        method: ChallengeMethod.OTP,
        email: 'alice@example.com',
        userId: 'user-1',
      });
      expect(mail.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'alice@example.com',
          text: expect.stringContaining('222222'),
        }),
      );
      expect(result).toEqual({ challengeId: 'chal-2' });
    });
  });

  describe('confirmSelfDelete', () => {
    it('throws BadRequestException when the challenge purpose is wrong', async () => {
      challenges.verify.mockResolvedValue({
        purpose: ChallengePurpose.LOGIN,
        userId: 'user-1',
      });

      await expect(
        service.confirmSelfDelete('user-1', 'chal-2', '222222'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when the challenge belongs to a different user', async () => {
      challenges.verify.mockResolvedValue({
        purpose: ChallengePurpose.SELF_DELETE,
        userId: 'someone-else',
      });

      await expect(
        service.confirmSelfDelete('user-1', 'chal-2', '222222'),
      ).rejects.toThrow(BadRequestException);
    });

    it('calls remove() on success', async () => {
      challenges.verify.mockResolvedValue({
        purpose: ChallengePurpose.SELF_DELETE,
        userId: 'user-1',
      });
      prisma.user.update.mockResolvedValue(
        buildUser({ status: UserStatus.DELETED }),
      );
      prisma.userRole.deleteMany.mockResolvedValue({ count: 0 });

      await service.confirmSelfDelete('user-1', 'chal-2', '222222');

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'user-1' } }),
      );
      expect(prisma.userRole.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
    });
  });

  describe('remove', () => {
    it('anonymizes the user fields and clears role assignments', async () => {
      prisma.user.update.mockResolvedValue(
        buildUser({ status: UserStatus.DELETED }),
      );
      prisma.userRole.deleteMany.mockResolvedValue({ count: 2 });

      await service.remove('user-1');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          email: 'deleted-user-1@deleted.local',
          name: null,
          passwordHash: 'random-hash',
          status: UserStatus.DELETED,
        },
      });
      expect(prisma.userRole.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
    });
  });

  describe('toSelfProfile / toPublicProfile', () => {
    it('shapes the self profile with all non-sensitive fields', () => {
      const user = buildUser({ name: 'Alice' });

      expect(service.toSelfProfile(user as any)).toEqual({
        id: 'user-1',
        email: 'alice@example.com',
        name: 'Alice',
        status: UserStatus.ACTIVE,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      });
    });

    it('shapes the public profile with only id/email/status', () => {
      const user = buildUser({ name: 'Alice' });

      expect(service.toPublicProfile(user as any)).toEqual({
        id: 'user-1',
        email: 'alice@example.com',
        status: UserStatus.ACTIVE,
      });
    });
  });

  describe('list', () => {
    it('builds the where clause from status and q, and paginates without a cursor', async () => {
      const users = [buildUser({ id: 'u1' }), buildUser({ id: 'u2' })];
      prisma.user.findMany.mockResolvedValue(users);

      const result = await service.list({
        limit: 2,
        status: UserStatus.ACTIVE,
        q: 'ali',
        sort: 'createdAt',
        order: 'desc',
      });

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: {
          status: UserStatus.ACTIVE,
          OR: [
            { email: { contains: 'ali', mode: 'insensitive' } },
            { name: { contains: 'ali', mode: 'insensitive' } },
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: 3,
      });
      expect(result.items).toHaveLength(2);
      expect(result.nextCursor).toBeNull();
    });

    it('passes cursor/skip when a cursor is given', async () => {
      prisma.user.findMany.mockResolvedValue([buildUser()]);

      await service.list({
        limit: 20,
        cursor: 'cursor-id',
        sort: 'email',
        order: 'asc',
      });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ cursor: { id: 'cursor-id' }, skip: 1 }),
      );
    });

    it('sets nextCursor and trims the extra row when there are more results', async () => {
      const users = [
        buildUser({ id: 'u1' }),
        buildUser({ id: 'u2' }),
        buildUser({ id: 'u3' }),
      ];
      prisma.user.findMany.mockResolvedValue(users);

      const result = await service.list({
        limit: 2,
        sort: 'createdAt',
        order: 'desc',
      });

      expect(result.items).toHaveLength(2);
      expect(result.nextCursor).toBe('u2');
    });

    it('maps a P2025 error to BadRequestException (invalid cursor)', async () => {
      prisma.user.findMany.mockRejectedValue(makeP2025());

      await expect(
        service.list({
          limit: 20,
          cursor: 'bogus',
          sort: 'createdAt',
          order: 'desc',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rethrows unrelated errors from findMany', async () => {
      prisma.user.findMany.mockRejectedValue(new Error('db down'));

      await expect(
        service.list({ limit: 20, sort: 'createdAt', order: 'desc' }),
      ).rejects.toThrow('db down');
    });
  });
});
