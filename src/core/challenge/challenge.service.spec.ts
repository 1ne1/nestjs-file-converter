import { BadRequestException, HttpException } from '@nestjs/common';
import * as argon2 from 'argon2';

import { PrismaService } from '@/core/database/prisma.service';
import { ChallengeMethod, ChallengePurpose } from '@/generated/prisma/client';

import { ChallengeService } from './challenge.service';

interface CreateCallArgs {
  data: {
    secretHash: string;
    maxAttempts: number;
    userId?: string | null;
    metadata?: unknown;
    expiresAt: Date;
  };
}

describe('ChallengeService', () => {
  let service: ChallengeService;
  let prisma: {
    emailChallenge: {
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      findUnique: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      emailChallenge: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
      },
    };
    service = new ChallengeService(prisma as unknown as PrismaService);
  });

  describe('create', () => {
    it('throws 429 when a recent challenge exists for this email+purpose', async () => {
      prisma.emailChallenge.findFirst.mockResolvedValue({ id: 'existing' });

      await expect(
        service.create({
          purpose: ChallengePurpose.REGISTRATION,
          method: ChallengeMethod.OTP,
          email: 'a@example.com',
        }),
      ).rejects.toMatchObject({
        response: 'Please wait before requesting another code',
        status: 429,
      });

      expect(prisma.emailChallenge.create).not.toHaveBeenCalled();
    });

    it('throws 429 even when the recent challenge was already consumed', async () => {
      prisma.emailChallenge.findFirst.mockResolvedValue({
        id: 'existing',
        consumedAt: new Date(),
      });

      await expect(
        service.create({
          purpose: ChallengePurpose.LOGIN,
          method: ChallengeMethod.OTP,
          email: 'a@example.com',
        }),
      ).rejects.toBeInstanceOf(HttpException);
    });

    it('generates a 6-digit numeric code for OTP', async () => {
      prisma.emailChallenge.findFirst.mockResolvedValue(null);
      prisma.emailChallenge.create.mockImplementation((args: CreateCallArgs) =>
        Promise.resolve({ id: 'challenge-1', ...args.data }),
      );

      const result = await service.create({
        purpose: ChallengePurpose.REGISTRATION,
        method: ChallengeMethod.OTP,
        email: 'a@example.com',
      });

      expect(result.challengeId).toBe('challenge-1');
      expect(result.secret).toMatch(/^\d{6}$/);
    });

    it('generates a long opaque token for MAGIC_LINK', async () => {
      prisma.emailChallenge.findFirst.mockResolvedValue(null);
      prisma.emailChallenge.create.mockImplementation((args: CreateCallArgs) =>
        Promise.resolve({ id: 'challenge-2', ...args.data }),
      );

      const result = await service.create({
        purpose: ChallengePurpose.LOGIN,
        method: ChallengeMethod.MAGIC_LINK,
        email: 'a@example.com',
      });

      expect(result.secret.length).toBeGreaterThan(20);
      expect(result.secret).not.toMatch(/^\d{6}$/);
    });

    it('stores a hash of the secret, default maxAttempts, and default TTL-derived expiry', async () => {
      prisma.emailChallenge.findFirst.mockResolvedValue(null);
      const before = Date.now();
      prisma.emailChallenge.create.mockImplementation((args: CreateCallArgs) =>
        Promise.resolve({ id: 'challenge-3', ...args.data }),
      );

      const result = await service.create({
        purpose: ChallengePurpose.SELF_DELETE,
        method: ChallengeMethod.OTP,
        email: 'a@example.com',
        userId: 'user-1',
        metadata: { foo: 'bar' },
      });

      const calls = prisma.emailChallenge.create.mock.calls as [
        CreateCallArgs,
      ][];
      const createCall = calls[0][0];
      expect(createCall.data.secretHash).not.toBe(result.secret);
      expect(
        await argon2.verify(createCall.data.secretHash, result.secret),
      ).toBe(true);
      expect(createCall.data.maxAttempts).toBe(5);
      expect(createCall.data.userId).toBe('user-1');
      expect(createCall.data.metadata).toEqual({ foo: 'bar' });
      expect(createCall.data.expiresAt.getTime()).toBeGreaterThanOrEqual(
        before + 10 * 60 * 1000 - 1000,
      );
    });

    it('honors custom ttlMs and maxAttempts', async () => {
      prisma.emailChallenge.findFirst.mockResolvedValue(null);
      prisma.emailChallenge.create.mockImplementation((args: CreateCallArgs) =>
        Promise.resolve({ id: 'challenge-4', ...args.data }),
      );

      const before = Date.now();
      await service.create({
        purpose: ChallengePurpose.EMAIL_CHANGE,
        method: ChallengeMethod.OTP,
        email: 'a@example.com',
        ttlMs: 1000,
        maxAttempts: 2,
      });

      const calls = prisma.emailChallenge.create.mock.calls as [
        CreateCallArgs,
      ][];
      const createCall = calls[0][0];
      expect(createCall.data.maxAttempts).toBe(2);
      expect(createCall.data.expiresAt.getTime()).toBeLessThan(before + 5000);
    });
  });

  describe('verify', () => {
    function makeChallenge(overrides: Record<string, unknown> = {}) {
      return {
        id: 'challenge-1',
        purpose: ChallengePurpose.REGISTRATION,
        method: ChallengeMethod.OTP,
        email: 'a@example.com',
        secretHash: '',
        attempts: 0,
        maxAttempts: 5,
        expiresAt: new Date(Date.now() + 60_000),
        consumedAt: null,
        userId: null,
        metadata: null,
        createdAt: new Date(),
        ...overrides,
      };
    }

    it('throws when the challenge does not exist', async () => {
      prisma.emailChallenge.findUnique.mockResolvedValue(null);

      await expect(service.verify('missing', 'code')).rejects.toThrow(
        new BadRequestException('Invalid or expired code'),
      );
    });

    it('throws when the challenge was already consumed', async () => {
      prisma.emailChallenge.findUnique.mockResolvedValue(
        makeChallenge({ consumedAt: new Date() }),
      );

      await expect(service.verify('challenge-1', 'code')).rejects.toThrow(
        new BadRequestException('Invalid or expired code'),
      );
    });

    it('throws when the challenge has expired', async () => {
      prisma.emailChallenge.findUnique.mockResolvedValue(
        makeChallenge({ expiresAt: new Date(Date.now() - 1000) }),
      );

      await expect(service.verify('challenge-1', 'code')).rejects.toThrow(
        new BadRequestException('Invalid or expired code'),
      );
    });

    it('throws when the attempt limit has been reached', async () => {
      prisma.emailChallenge.findUnique.mockResolvedValue(
        makeChallenge({ attempts: 5, maxAttempts: 5 }),
      );

      await expect(service.verify('challenge-1', 'code')).rejects.toThrow(
        new BadRequestException('Attempt limit exceeded'),
      );
    });

    it('increments attempts and throws on a wrong secret', async () => {
      const secretHash = await argon2.hash('correct-secret');
      prisma.emailChallenge.findUnique.mockResolvedValue(
        makeChallenge({ secretHash }),
      );

      await expect(
        service.verify('challenge-1', 'wrong-secret'),
      ).rejects.toThrow(new BadRequestException('Invalid or expired code'));

      expect(prisma.emailChallenge.update).toHaveBeenCalledWith({
        where: { id: 'challenge-1' },
        data: { attempts: { increment: 1 } },
      });
    });

    it('marks the challenge consumed and returns it on a correct secret', async () => {
      const secretHash = await argon2.hash('correct-secret');
      const challenge = makeChallenge({ secretHash });
      prisma.emailChallenge.findUnique.mockResolvedValue(challenge);
      prisma.emailChallenge.update.mockResolvedValue({
        ...challenge,
        consumedAt: new Date(),
      });

      const result = await service.verify('challenge-1', 'correct-secret');

      const updateCall = prisma.emailChallenge.update.mock.calls[0][0] as {
        where: { id: string };
        data: { consumedAt: Date };
      };
      expect(updateCall.where).toEqual({ id: 'challenge-1' });
      expect(updateCall.data.consumedAt).toBeInstanceOf(Date);
      expect(result.consumedAt).not.toBeNull();
    });
  });
});
